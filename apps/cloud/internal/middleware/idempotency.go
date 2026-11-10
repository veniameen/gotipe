package middleware

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"time"

	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/auth"
)

type IdempotencyStore interface {
	Get(context.Context, string) ([]byte, error)
	Set(context.Context, string, []byte, time.Duration) error
	Eval(context.Context, string, []string, ...interface{}) (int64, error)
}
type cachedResponse struct {
	Fingerprint string      `json:"fingerprint"`
	Status      int         `json:"status"`
	Headers     http.Header `json:"headers,omitempty"`
	Body        []byte      `json:"body,omitempty"`
}

const claimIdempotency = `if redis.call('SET',KEYS[1],ARGV[1],'NX','EX',86400) then return 1 else return 0 end`

type ReplayAuthorizer func(http.ResponseWriter, *http.Request, []byte, []byte) bool

// IdempotencyMiddleware claims a key before invoking the mutation. An uncertain
// write remains claimed, so retries cannot repeat an operation after storage or
// process failure. Identical completed requests replay their original response.
func IdempotencyMiddleware(store IdempotencyStore, authorize ...ReplayAuthorizer) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := r.Header.Get("Idempotency-Key")
			if key == "" || r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
				next.ServeHTTP(w, r)
				return
			}
			if len(key) > 255 {
				apierror.ErrValidation.WithMessage("Idempotency-Key exceeds 255 bytes").Write(w)
				return
			}
			user := auth.UserFromContext(r.Context())
			if user == nil {
				apierror.ErrUnauthorized.Write(w)
				return
			}
			body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 10<<20))
			if err != nil {
				apierror.ErrValidation.WithMessage("Request body exceeds limit or cannot be read").Write(w)
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(body))
			// Streaming responses cannot be replayed as one atomic HTTP result.
			if r.URL.Path == "/v1/ai/complete" {
				var options struct {
					Stream bool `json:"stream"`
				}
				if json.Unmarshal(body, &options) == nil && options.Stream {
					apierror.ErrValidation.WithMessage("Idempotency-Key is supported for non-streaming AI requests").Write(w)
					return
				}
			}
			hash := sha256.New()
			hash.Write([]byte(r.Method + "\n" + r.URL.RequestURI() + "\n" + r.Header.Get("Content-Type") + "\n"))
			hash.Write(body)
			scopes := append([]string(nil), user.Scopes...)
			documents := append([]string(nil), user.DocumentIDs...)
			sort.Strings(scopes)
			sort.Strings(documents)
			authority, _ := json.Marshal(struct {
				Scopes, Documents []string
				Org               string
			}{scopes, documents, user.OrgID})
			hash.Write(authority)
			fingerprint := hex.EncodeToString(hash.Sum(nil))
			keyHash := sha256.Sum256([]byte(key))
			cacheKey := "idempotency:" + user.UserID + ":" + hex.EncodeToString(keyHash[:])
			pending, _ := json.Marshal(cachedResponse{Fingerprint: fingerprint})
			claimed, err := store.Eval(r.Context(), claimIdempotency, []string{cacheKey}, string(pending))
			if err != nil {
				apierror.ErrServiceDown.Write(w)
				return
			}
			if claimed != 1 {
				cached, err := store.Get(r.Context(), cacheKey)
				if err != nil {
					apierror.ErrServiceDown.Write(w)
					return
				}
				var response cachedResponse
				if len(cached) == 0 || json.Unmarshal(cached, &response) != nil {
					apierror.ErrServiceDown.Write(w)
					return
				}
				if response.Fingerprint != fingerprint {
					apierror.ErrConflict.WithMessage("Idempotency-Key was already used for a different request").Write(w)
					return
				}
				if response.Status == 0 {
					apierror.ErrConflict.WithMessage("The original request is pending or its result is uncertain; do not repeat the mutation with a new key").Write(w)
					return
				}
				if response.Status >= 200 && response.Status < 300 && len(response.Body) > 0 {
					for _, check := range authorize {
						if !check(w, r, body, response.Body) {
							return
						}
					}
				}
				writeCached(w, response)
				return
			}
			recorder := httptest.NewRecorder()
			next.ServeHTTP(recorder, r)
			response := cachedResponse{Fingerprint: fingerprint, Status: recorder.Code, Headers: recorder.Header().Clone(), Body: recorder.Body.Bytes()}
			data, err := json.Marshal(response)
			if err != nil {
				apierror.ErrServiceDown.Write(w)
				return
			}
			if err = store.Set(r.Context(), cacheKey, data, 24*time.Hour); err != nil {
				apierror.ErrServiceDown.WithMessage("Request outcome could not be recorded; retain the same Idempotency-Key").Write(w)
				return
			}
			writeCached(w, response)
		})
	}
}
func writeCached(w http.ResponseWriter, response cachedResponse) {
	for key, values := range response.Headers {
		w.Header()[key] = append([]string(nil), values...)
	}
	w.WriteHeader(response.Status)
	_, _ = w.Write(response.Body)
}
