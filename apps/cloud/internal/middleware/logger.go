package middleware

import (
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/gotipe/cloud/internal/audit"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// LoggerMiddleware logs each request and hands the client address (see
// ClientAddresses) to the audit log. A trusted proxy's own address is logged as
// proxy_addr. Forwarded headers from an untrusted peer are logged as a warning at
// most once a minute: behind a proxy they mean TRUSTED_PROXIES misses it.
func LoggerMiddleware(log *slog.Logger, clients ClientAddresses) func(http.Handler) http.Handler {
	warnings := &throttle{every: time.Minute}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chiMiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
			client := clients.Of(r)
			if clients.ignoresForwarding(r) {
				if suppressed, ok := warnings.allow(start); ok {
					log.Warn("ignored X-Forwarded-For/X-Real-IP from a peer outside TRUSTED_PROXIES; if this peer is your reverse proxy, every client shares its login rate limit",
						"peer", peerHost(r.RemoteAddr), "trusted_proxies", clients, "suppressed", suppressed)
				}
			}

			next.ServeHTTP(ww, r.WithContext(audit.WithRemoteAddress(r.Context(), client)))

			attributes := []any{
				"method", r.Method,
				"path", r.URL.Path,
				"status", ww.Status(),
				"latency_ms", time.Since(start).Milliseconds(),
				"request_id", RequestIDFromContext(r.Context()),
				"remote_addr", client,
			}
			if peer := peerHost(r.RemoteAddr); peer != client {
				attributes = append(attributes, "proxy_addr", peer)
			}
			log.Info("request", attributes...)
		})
	}
}

// throttle lets an event through at most once per interval and counts the
// events it held back since the last one it let through.
type throttle struct {
	mu         sync.Mutex
	every      time.Duration
	next       time.Time
	suppressed int
}

func (t *throttle) allow(now time.Time) (suppressed int, ok bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if now.Before(t.next) {
		t.suppressed++
		return 0, false
	}
	suppressed, t.suppressed, t.next = t.suppressed, 0, now.Add(t.every)
	return suppressed, true
}
