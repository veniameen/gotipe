package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gotipe/cloud/internal/apierror"
	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	internalBilling "github.com/gotipe/cloud/internal/billing"
	"github.com/gotipe/cloud/internal/storage"
)

type BillingHandler struct {
	db     *storage.PostgresStore
	stripe *internalBilling.StripeClient
	audit  *audit.AuditLogger
	prices map[string]string // plan -> stripe price ID
}

func NewBillingHandler(db *storage.PostgresStore, stripeClient *internalBilling.StripeClient, auditLogger *audit.AuditLogger, prices map[string]string) *BillingHandler {
	return &BillingHandler{
		db:     db,
		stripe: stripeClient,
		audit:  auditLogger,
		prices: prices,
	}
}

type CreateSubscriptionRequest struct {
	Plan       string `json:"plan"` // "starter", "pro", "business"
	SuccessURL string `json:"success_url"`
	CancelURL  string `json:"cancel_url"`
}

type SubscriptionResponse struct {
	SubscriptionID string `json:"subscription_id,omitempty"`
	CheckoutURL    string `json:"checkout_url,omitempty"`
	Plan           string `json:"plan"`
	Status         string `json:"status"`
}

// CreateSubscription handles POST /v1/billing/subscribe
func (h *BillingHandler) CreateSubscription() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		var req CreateSubscriptionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.ErrInvalidJSON.Write(w)
			return
		}

		priceID, ok := h.prices[req.Plan]
		if !ok {
			apierror.ErrValidation.WithMessage("invalid plan").Write(w)
			return
		}

		// Get or create Stripe customer
		var stripeCustomerID string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT stripe_customer_id FROM users WHERE id = $1`, user.UserID,
		).Scan(&stripeCustomerID)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		if stripeCustomerID == "" {
			var email, name string
			_ = h.db.Pool.QueryRow(r.Context(),
				`SELECT email, name FROM users WHERE id = $1`, user.UserID,
			).Scan(&email, &name)

			// Create Stripe customer OUTSIDE DB transaction
			cust, err := h.stripe.CreateCustomer(email, name)
			if err != nil {
				apierror.ErrInternal.Write(w)
				return
			}
			stripeCustomerID = cust.ID

			_, _ = h.db.Pool.Exec(r.Context(),
				`UPDATE users SET stripe_customer_id = $1 WHERE id = $2`,
				stripeCustomerID, user.UserID,
			)
		}

		// Create Checkout Session — OUTSIDE DB transaction
		sess, err := h.stripe.CreateCheckoutSession(stripeCustomerID, priceID, req.SuccessURL, req.CancelURL)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionBillingSubscribe, "billing", "", map[string]string{"plan": req.Plan})

		apierror.WriteJSON(w, http.StatusOK, SubscriptionResponse{
			CheckoutURL: sess.URL,
			Plan:        req.Plan,
			Status:      "pending",
		})
	}
}

// CancelSubscription handles POST /v1/billing/cancel
func (h *BillingHandler) CancelSubscription() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		// Get subscription ID
		var subscriptionID string
		err := h.db.Pool.QueryRow(r.Context(),
			`SELECT stripe_subscription_id FROM subscriptions
			 WHERE user_id = $1 AND status = 'active'`,
			user.UserID,
		).Scan(&subscriptionID)
		if err != nil {
			apierror.ErrNotFound.WithMessage("No active subscription").Write(w)
			return
		}

		// Cancel in Stripe — OUTSIDE DB transaction
		_, err = h.stripe.CancelSubscription(subscriptionID)
		if err != nil {
			apierror.ErrInternal.Write(w)
			return
		}

		_, _ = h.db.Pool.Exec(r.Context(),
			`UPDATE subscriptions SET status = 'canceling' WHERE stripe_subscription_id = $1`,
			subscriptionID,
		)

		_ = h.audit.Log(r.Context(), user.UserID, audit.ActionBillingCancel, "billing", subscriptionID, nil)

		apierror.WriteJSON(w, http.StatusOK, map[string]string{"status": "canceling"})
	}
}

// GetUsage handles GET /v1/billing/usage
func (h *BillingHandler) GetUsage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.ErrUnauthorized.Write(w)
			return
		}

		plan := internalBilling.GetPlan(user.Plan)

		var docCount, aiCount, exportCount int64
		_ = h.db.Pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM documents WHERE owner_id = $1`, user.UserID,
		).Scan(&docCount)
		_ = h.db.Pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM usage_logs WHERE user_id = $1 AND action = 'ai.request' AND created_at > date_trunc('month', now())`,
			user.UserID,
		).Scan(&aiCount)
		_ = h.db.Pool.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM export_jobs WHERE user_id = $1 AND created_at > date_trunc('month', now())`,
			user.UserID,
		).Scan(&exportCount)

		apierror.WriteJSON(w, http.StatusOK, map[string]interface{}{
			"plan": user.Plan,
			"usage": map[string]interface{}{
				"documents":   map[string]int64{"current": docCount, "limit": plan.DocumentLimit},
				"ai_requests": map[string]int64{"current": aiCount, "limit": plan.AIRequestLimit},
				"exports":     map[string]int64{"current": exportCount, "limit": plan.ExportLimit},
			},
		})
	}
}
