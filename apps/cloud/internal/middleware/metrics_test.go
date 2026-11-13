package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

type observations []string

func (o *observations) ObserveRequest(method, route string, status int, elapsed time.Duration) {
	if elapsed < 0 {
		panic("negative duration")
	}
	*o = append(*o, fmt.Sprintf("%s %s %d", method, route, status))
}

// recoverQuietly stands in for chi's Recoverer (500 on panic) without its stack dump.
func recoverQuietly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recover() != nil {
				w.WriteHeader(http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func TestMetricsUseRoutePatternsAndFinalStatus(t *testing.T) {
	var seen observations
	r := chi.NewRouter()
	r.Use(MetricsMiddleware(&seen))
	r.Use(recoverQuietly)
	r.Group(func(r chi.Router) {
		r.Use(func(next http.Handler) http.Handler { return next })
		r.Get("/v1/documents/{id}", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(404) })
		r.Delete("/v1/documents/{id}", func(http.ResponseWriter, *http.Request) {})
	})
	r.With(func(next http.Handler) http.Handler { return next }).Post("/v1/auth/token", func(http.ResponseWriter, *http.Request) { panic("boom") })
	r.NotFound(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(404) })
	for _, request := range []struct{ method, path string }{
		{"GET", "/v1/documents/6f1c2b8e-0d1a-4f5e-9a63-2a7d1e0b9c44"},
		{"DELETE", "/v1/documents/another-id"},
		{"POST", "/v1/auth/token"},
		{"GET", "/wp-login.php"},
		{"PROPFIND", "/v1/documents/x"},
	} {
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(request.method, request.path, nil))
	}
	want := []string{
		"GET /v1/documents/{id} 404",
		"DELETE /v1/documents/{id} 200",
		"POST /v1/auth/token 500",
		"GET unmatched 404",
		"OTHER unmatched 405",
	}
	if strings.Join(seen, "\n") != strings.Join(want, "\n") {
		t.Fatalf("got\n%s\nwant\n%s", strings.Join(seen, "\n"), strings.Join(want, "\n"))
	}
}
