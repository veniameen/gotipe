package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/gotipe/cloud/internal/storage"
	"github.com/stripe/stripe-go/v81"
)

type SubscriptionReader interface {
	GetSubscription(context.Context, string) (*stripe.Subscription, error)
}

// EventProcessor reconciles authoritative current subscription state. Reading
// Stripe again avoids applying an old event's payload after a newer delivery.
type EventProcessor struct {
	DB            storage.Database
	Subscriptions SubscriptionReader
	Prices        map[string]string // plan -> configured Stripe price
}

// eventObject is the part of an event's object the processor reads: the ID of the
// subscription concerned, nothing else. The subscription itself is fetched again
// with the API version stripe-go is built for, so an event of another API version
// cannot be misread. Since 2025-03-31.basil an invoice names its subscription under
// parent.subscription_details instead of subscription.
type eventObject struct {
	ID           string          `json:"id"`
	Subscription json.RawMessage `json:"subscription"`
	Parent       *struct {
		SubscriptionDetails *struct {
			Subscription json.RawMessage `json:"subscription"`
		} `json:"subscription_details"`
	} `json:"parent"`
}

// referenceID reads a reference that is an ID or an expanded object with an id.
func referenceID(raw json.RawMessage) string {
	var id string
	if json.Unmarshal(raw, &id) == nil {
		return id
	}
	var object struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(raw, &object) == nil {
		return object.ID
	}
	return ""
}

func (p *EventProcessor) Process(ctx context.Context, event *stripe.Event) error {
	if event == nil || event.Data == nil {
		return errors.New("missing webhook event data")
	}
	var object eventObject
	switch event.Type {
	case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
		"checkout.session.completed", "checkout.session.async_payment_succeeded",
		"invoice.payment_failed", "invoice.paid":
		if err := json.Unmarshal(event.Data.Raw, &object); err != nil {
			return err
		}
	default:
		return nil
	}
	var subscriptionID string
	switch event.Type {
	case "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted":
		subscriptionID = object.ID
	default:
		subscriptionID = referenceID(object.Subscription)
		if subscriptionID == "" && object.Parent != nil && object.Parent.SubscriptionDetails != nil {
			subscriptionID = referenceID(object.Parent.SubscriptionDetails.Subscription)
		}
		if subscriptionID == "" {
			return nil // a one-time payment, not a subscription
		}
	}
	if subscriptionID == "" {
		return errors.New("missing subscription id")
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	// Serialize the authoritative fetch as well as the write. Otherwise an older
	// provider response can arrive after a newer reconciliation and undo it.
	return storage.WithAdvisoryTransaction(ctx, p.DB, "billing:"+subscriptionID, func(tx storage.Database) error {
		return p.reconcile(ctx, tx, subscriptionID)
	})
}

func (p *EventProcessor) reconcile(ctx context.Context, db storage.Database, subscriptionID string) error {
	subscription, err := p.Subscriptions.GetSubscription(ctx, subscriptionID)
	if err != nil {
		return fmt.Errorf("load current subscription: %w", err)
	}
	if subscription == nil || subscription.ID != subscriptionID || subscription.Customer == nil || subscription.Customer.ID == "" {
		return errors.New("invalid current subscription")
	}
	plan, err := p.planFor(subscription)
	if err != nil {
		return err
	}
	status := string(subscription.Status)
	if subscription.CancelAtPeriodEnd && (status == "active" || status == "trialing") {
		status = "canceling"
	}
	// Acquire the account lock in its own statement, so the following READ
	// COMMITTED snapshot includes any other subscription reconciliation it waited for.
	var ownerID string
	if err := db.QueryRow(ctx, `SELECT id FROM users WHERE stripe_customer_id=$1 FOR UPDATE`, subscription.Customer.ID).Scan(&ownerID); err != nil {
		return fmt.Errorf("lock subscription customer: %w", err)
	}
	// Both records change atomically. Other paid subscriptions keep their
	// entitlement when this subscription is canceled or becomes past due.
	tag, err := db.Exec(ctx, `WITH owner AS (
		SELECT id FROM users WHERE stripe_customer_id=$3 FOR UPDATE
	), saved AS (
		INSERT INTO subscriptions(stripe_subscription_id,user_id,plan,status,current_period_start,current_period_end)
		SELECT $1,id,$2,$4,to_timestamp($5),to_timestamp($6) FROM owner
		ON CONFLICT(stripe_subscription_id) DO UPDATE SET plan=EXCLUDED.plan,status=EXCLUDED.status,
		current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end,updated_at=now()
		WHERE subscriptions.user_id=EXCLUDED.user_id
		RETURNING user_id,plan,status
	), entitlements AS (
		SELECT user_id,plan,status FROM saved UNION ALL
		SELECT user_id,plan,status FROM subscriptions WHERE user_id IN(SELECT id FROM owner) AND stripe_subscription_id<>$1
	) UPDATE users SET plan=COALESCE((SELECT plan FROM entitlements WHERE status IN('active','trialing','canceling')
		ORDER BY CASE plan WHEN 'business' THEN 3 WHEN 'pro' THEN 2 WHEN 'starter' THEN 1 ELSE 0 END DESC LIMIT 1),'free')
	WHERE id IN(SELECT user_id FROM saved)`, subscription.ID, plan, subscription.Customer.ID, status, subscription.CurrentPeriodStart, subscription.CurrentPeriodEnd)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return errors.New("subscription customer is not linked to an account")
	}
	return nil
}

func (p *EventProcessor) planFor(subscription *stripe.Subscription) (string, error) {
	if subscription.Items != nil {
		for _, item := range subscription.Items.Data {
			if item == nil || item.Price == nil {
				continue
			}
			for plan, price := range p.Prices {
				if price != "" && price == item.Price.ID {
					return plan, nil
				}
			}
		}
	}
	return "", errors.New("subscription has no configured GoTipe price")
}
