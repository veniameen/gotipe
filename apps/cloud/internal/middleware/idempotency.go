package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"time"

	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
)

type cachedResponse struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    []byte            `json:"body"`
}

func IdempotencyMiddleware(valkeyStore *storage.ValkeyStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Only mutating methods
			if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
				next.ServeHTTP(w, r)
				return
			}

			key := r.Header.Get("Idempotency-Key")
			if key == "" {
				next.ServeHTTP(w, r)
				return
			}

			user := auth.UserFromContext(r.Context())
			userID := ""
			if user != nil {
				userID = user.UserID
			}

			cacheKey := "idempotency:" + userID + ":" + key

			// Check cached response
			cached, err := valkeyStore.Get(r.Context(), cacheKey)
			if err == nil && cached != nil {
				var resp cachedResponse
				if json.Unmarshal(cached, &resp) == nil {
					for k, v := range resp.Headers {
						w.Header().Set(k, v)
					}
					w.WriteHeader(resp.Status)
					w.Write(resp.Body)
					return
				}
			}

			// Capture response
			rec := httptest.NewRecorder()
			next.ServeHTTP(rec, r)

			// Cache response for 24h
			headers := make(map[string]string)
			for k := range rec.Header() {
				headers[k] = rec.Header().Get(k)
			}
			resp := cachedResponse{
				Status:  rec.Code,
				Headers: headers,
				Body:    rec.Body.Bytes(),
			}
			data, _ := json.Marshal(resp)
			_ = valkeyStore.Set(r.Context(), cacheKey, data, 24*time.Hour)

			// Write actual response
			for k, vals := range rec.Header() {
				for _, v := range vals {
					w.Header().Add(k, v)
				}
			}
			w.WriteHeader(rec.Code)
			w.Write(rec.Body.Bytes())
		})
	}
}
