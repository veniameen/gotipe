package handler

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/gotipe/cloud/internal/storage"
	"github.com/stripe/stripe-go/v81"
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

// StripeWebhook handles POST /v1/webhooks/stripe
// IMPORTANT: Always return 200 to Stripe, even on processing errors
func (h *WebhooksHandler) StripeWebhook() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 65536))
		if err != nil {
			// Still return 200 to Stripe
			w.WriteHeader(http.StatusOK)
			return
		}

		event, err := webhook.ConstructEvent(body, r.Header.Get("Stripe-Signature"), h.webhookSecret)
		if err != nil {
			h.log.Warn("invalid stripe webhook signature", "error", err)
			// Return 200 even on signature verification failure
			w.WriteHeader(http.StatusOK)
			return
		}

		// Store webhook for processing (retry-safe)
		_, insertErr := h.db.Pool.Exec(r.Context(),
			`INSERT INTO pending_webhooks (id, event_type, payload, status, attempts, created_at)
			 VALUES ($1, $2, $3, 'pending', 0, $4)
			 ON CONFLICT (id) DO NOTHING`,
			event.ID, event.Type, body, time.Now(),
		)
		if insertErr != nil {
			h.log.Error("failed to store webhook", "event_id", event.ID, "error", insertErr)
		}

		// Try to process immediately
		if err := h.processEvent(r.Context(), &event); err != nil {
			h.log.Error("webhook processing failed, will retry",
				"event_id", event.ID,
				"event_type", event.Type,
				"error", err,
			)
			// Mark for retry, but still return 200
			_, _ = h.db.Pool.Exec(r.Context(),
				`UPDATE pending_webhooks SET status = 'retry', last_error = $1 WHERE id = $2`,
				err.Error(), event.ID,
			)
		} else {
			// Mark as processed
			_, _ = h.db.Pool.Exec(r.Context(),
				`UPDATE pending_webhooks SET status = 'processed', processed_at = now() WHERE id = $1`,
				event.ID,
			)
		}

		// ALWAYS return 200 to Stripe
		w.WriteHeader(http.StatusOK)
	}
}

func (h *WebhooksHandler) processEvent(ctx context.Context, event *stripe.Event) error {
	switch event.Type {
	case "checkout.session.completed":
		var session stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &session); err != nil {
			return err
		}
		return h.handleCheckoutCompleted(ctx, &session)

	case "customer.subscription.updated":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			return err
		}
		return h.handleSubscriptionUpdated(ctx, &sub)

	case "customer.subscription.deleted":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			return err
		}
		return h.handleSubscriptionDeleted(ctx, &sub)

	case "invoice.payment_failed":
		var inv stripe.Invoice
		if err := json.Unmarshal(event.Data.Raw, &inv); err != nil {
			return err
		}
		return h.handlePaymentFailed(ctx, &inv)

	default:
		h.log.Debug("unhandled webhook event", "type", event.Type)
	}
	return nil
}

func (h *WebhooksHandler) handleCheckoutCompleted(ctx context.Context, session *stripe.CheckoutSession) error {
	if session.Subscription == nil {
		return nil
	}
	// Determine plan from price
	plan := "starter" // Default, would be determined from price ID in production

	_, err := h.db.Pool.Exec(ctx,
		`INSERT INTO subscriptions (stripe_subscription_id, user_id, plan, status, created_at)
		 SELECT $1, u.id, $2, 'active', now()
		 FROM users u WHERE u.stripe_customer_id = $3
		 ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = 'active', plan = $2`,
		session.Subscription.ID, plan, session.Customer.ID,
	)
	if err != nil {
		return err
	}

	// Update user plan
	_, err = h.db.Pool.Exec(ctx,
		`UPDATE users SET plan = $1 WHERE stripe_customer_id = $2`,
		plan, session.Customer.ID,
	)
	return err
}

func (h *WebhooksHandler) handleSubscriptionUpdated(ctx context.Context, sub *stripe.Subscription) error {
	status := string(sub.Status)
	_, err := h.db.Pool.Exec(ctx,
		`UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2`,
		status, sub.ID,
	)
	return err
}

func (h *WebhooksHandler) handleSubscriptionDeleted(ctx context.Context, sub *stripe.Subscription) error {
	_, err := h.db.Pool.Exec(ctx,
		`UPDATE subscriptions SET status = 'canceled' WHERE stripe_subscription_id = $1`,
		sub.ID,
	)
	if err != nil {
		return err
	}

	// Downgrade user to free
	_, err = h.db.Pool.Exec(ctx,
		`UPDATE users SET plan = 'free' WHERE stripe_customer_id = $1`,
		sub.Customer.ID,
	)
	return err
}

func (h *WebhooksHandler) handlePaymentFailed(ctx context.Context, inv *stripe.Invoice) error {
	if inv.Subscription == nil {
		return nil
	}
	_, err := h.db.Pool.Exec(ctx,
		`UPDATE subscriptions SET status = 'past_due' WHERE stripe_subscription_id = $1`,
		inv.Subscription.ID,
	)
	return err
}
