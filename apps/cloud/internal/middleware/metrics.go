package middleware

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
)

// RequestObserver receives one observation per finished HTTP request. route is
// the matched route pattern ("/v1/documents/{id}"), never the raw path, so IDs do
// not become metric labels; requests that match no route report "unmatched".
type RequestObserver interface {
	ObserveRequest(method, route string, status int, elapsed time.Duration)
}

// MetricsMiddleware must run outside the panic recoverer so a recovered panic is
// observed with its 500 status.
func MetricsMiddleware(observer RequestObserver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chiMiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			status := ww.Status()
			if status == 0 {
				status = http.StatusOK // net/http sends 200 for a handler that wrote nothing
			}
			observer.ObserveRequest(methodLabel(r.Method), routeLabel(r), status, time.Since(start))
		})
	}
}

func routeLabel(r *http.Request) string {
	if route := chi.RouteContext(r.Context()); route != nil {
		if pattern := route.RoutePattern(); pattern != "" {
			return pattern
		}
	}
	return "unmatched"
}

func methodLabel(method string) string {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions:
		return method
	}
	return "OTHER"
}
