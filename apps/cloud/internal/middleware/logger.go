package middleware

import (
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/gotipe/cloud/internal/audit"
	"log/slog"
	"net/http"
	"time"
)

func LoggerMiddleware(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chiMiddleware.NewWrapResponseWriter(w, r.ProtoMajor)

			next.ServeHTTP(ww, r.WithContext(audit.WithRemoteAddress(r.Context(), r.RemoteAddr)))

			log.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", ww.Status(),
				"latency_ms", time.Since(start).Milliseconds(),
				"request_id", RequestIDFromContext(r.Context()),
				"remote_addr", r.RemoteAddr,
			)
		})
	}
}
