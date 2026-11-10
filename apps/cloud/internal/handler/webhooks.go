package handler

import (
	"io"
	"log/slog"
	"net/http"

	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/stripe/stripe-go/v81/webhook"
)

type WebhooksHandler struct {
	db            *storage.PostgresStore
	webhookSecret string
	log           *slog.Logger
}

func NewWebhooksHandler(db *storage.PostgresStore, webhookSecret string, log *slog.Logger) *WebhooksHandler {
	return &WebhooksHandler{db: db, webhookSecret: webhookSecret, log: log}
}

// StripeWebhook acknowledges only verified, durably queued events. The worker
// owns processing/retries; duplicate deliveries do not start duplicate work.
func (h *WebhooksHandler) StripeWebhook() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if h.webhookSecret == "" {
			apierror.ErrServiceDown.Write(w)
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
		if err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}
		event, err := webhook.ConstructEvent(body, r.Header.Get("Stripe-Signature"), h.webhookSecret)
		if err != nil || event.ID == "" {
			apierror.ErrValidation.WithMessage("Invalid webhook signature or event").Write(w)
			return
		}
		_, err = h.db.Pool.Exec(r.Context(), `INSERT INTO pending_webhooks (id,event_type,payload,status,attempts,created_at)
		VALUES ($1,$2,$3,'pending',0,now()) ON CONFLICT (id) DO NOTHING`, event.ID, event.Type, body)
		if err != nil {
			h.log.Error("failed to persist webhook", "event_id", event.ID, "error", err)
			apierror.ErrServiceDown.Write(w)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}
