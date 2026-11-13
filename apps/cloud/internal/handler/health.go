package handler

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gotipe/cloud/internal/apierror"
)

func Healthz() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		apierror.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// ReadinessCheck reports whether one dependency can serve requests.
type ReadinessCheck func(context.Context) error

// Readyz is public, so its body names each dependency only as "ok" or
// "unavailable"; the error itself, which can name internal hosts or credential
// problems, goes to the log. Checks run concurrently under one deadline.
func Readyz(log *slog.Logger, checks map[string]ReadinessCheck) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()

		results := make(map[string]string, len(checks))
		var mu sync.Mutex
		var wg sync.WaitGroup
		for name, check := range checks {
			wg.Add(1)
			go func() {
				defer wg.Done()
				state := "ok"
				if err := check(ctx); err != nil {
					state = "unavailable"
					log.Warn("readiness check failed", "dependency", name, "error", err)
				}
				mu.Lock()
				results[name] = state
				mu.Unlock()
			}()
		}
		wg.Wait()

		status, statusText := http.StatusOK, "ok"
		for _, state := range results {
			if state != "ok" {
				status, statusText = http.StatusServiceUnavailable, "degraded"
			}
		}
		apierror.WriteJSON(w, status, map[string]interface{}{
			"status": statusText,
			"checks": results,
		})
	}
}
