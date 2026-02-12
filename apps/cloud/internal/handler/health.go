package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/storage"
)

func Healthz() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		apierror.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func Readyz(db *storage.PostgresStore, valkeyStore *storage.ValkeyStore, r2 *storage.R2Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()

		checks := map[string]string{}
		allOK := true

		if err := db.Ping(ctx); err != nil {
			checks["postgres"] = err.Error()
			allOK = false
		} else {
			checks["postgres"] = "ok"
		}

		if err := valkeyStore.Ping(ctx); err != nil {
			checks["valkey"] = err.Error()
			allOK = false
		} else {
			checks["valkey"] = "ok"
		}

		if err := r2.HeadBucket(ctx); err != nil {
			checks["r2"] = err.Error()
			allOK = false
		} else {
			checks["r2"] = "ok"
		}

		status := http.StatusOK
		statusText := "ok"
		if !allOK {
			status = http.StatusServiceUnavailable
			statusText = "degraded"
		}

		apierror.WriteJSON(w, status, map[string]interface{}{
			"status": statusText,
			"checks": checks,
		})
	}
}
