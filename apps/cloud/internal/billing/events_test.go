package billing

import (
	"context"
	"errors"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stripe/stripe-go/v81"
	"strings"
	"testing"
)

type subscriptionReader func(string) (*stripe.Subscription, error)

func (f subscriptionReader) GetSubscription(_ context.Context, id string) (*stripe.Subscription, error) {
	return f(id)
}

type eventDB struct {
	storage.Database
	exec func(...any) (pgconn.CommandTag, error)
}

func (db eventDB) Exec(_ context.Context, _ string, args ...any) (pgconn.CommandTag, error) {
	return db.exec(args...)
}
func currentSubscription() *stripe.Subscription {
	return &stripe.Subscription{ID: "sub", Customer: &stripe.Customer{ID: "cus"}, Status: stripe.SubscriptionStatusActive, Items: &stripe.SubscriptionItemList{Data: []*stripe.SubscriptionItem{{Price: &stripe.Price{ID: "price_pro"}}}}}
}

func TestEventProcessorUsesCurrentPriceAndStatusInsteadOfStalePayload(t *testing.T) {
	for _, status := range []stripe.SubscriptionStatus{stripe.SubscriptionStatusActive, stripe.SubscriptionStatusCanceled} {
		current := currentSubscription()
		current.Status = status
		p := &EventProcessor{Prices: map[string]string{"pro": "price_pro"}, Subscriptions: subscriptionReader(func(id string) (*stripe.Subscription, error) {
			if id != "sub" {
				t.Fatal(id)
			}
			return current, nil
		}), DB: eventDB{exec: func(args ...any) (pgconn.CommandTag, error) {
			if args[1] != "pro" || args[2] != "cus" || args[3] != string(status) {
				t.Fatalf("incorrect entitlement %v", args)
			}
			return pgconn.NewCommandTag("UPDATE 1"), nil
		}}}
		if err := p.Process(context.Background(), &stripe.Event{Type: "customer.subscription.updated", Data: &stripe.EventData{Raw: []byte(`{"id":"sub","status":"past_due"}`)}}); err != nil {
			t.Fatal(err)
		}
	}
}
func TestEventProcessorRejectsUnknownPriceProviderFailureAndUnknownCustomer(t *testing.T) {
	for _, kind := range []string{"price", "provider", "customer"} {
		current := currentSubscription()
		if kind == "price" {
			current.Items = nil
		}
		p := &EventProcessor{Prices: map[string]string{"pro": "price_pro"}, Subscriptions: subscriptionReader(func(string) (*stripe.Subscription, error) {
			if kind == "provider" {
				return nil, errors.New("unavailable")
			}
			return current, nil
		}), DB: eventDB{exec: func(...any) (pgconn.CommandTag, error) {
			if kind != "customer" {
				t.Fatal("wrote invalid provider state")
			}
			return pgconn.NewCommandTag("UPDATE 0"), nil
		}}}
		if err := p.Process(context.Background(), &stripe.Event{Type: "checkout.session.completed", Data: &stripe.EventData{Raw: []byte(`{"subscription":"sub"}`)}}); err == nil {
			t.Fatalf("accepted %s", kind)
		}
	}
}

type eventTransaction struct {
	pgx.Tx
	db eventDB
}

func (db eventDB) BeginTx(context.Context, pgx.TxOptions) (pgx.Tx, error) {
	return &eventTransaction{db: db}, nil
}
func (tx *eventTransaction) Exec(ctx context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	if strings.Contains(query, "pg_advisory_xact_lock") {
		return pgconn.NewCommandTag("SELECT 1"), nil
	}
	return tx.db.Exec(ctx, query, args...)
}
func (tx *eventTransaction) QueryRow(context.Context, string, ...any) pgx.Row { return eventRow{} }
func (tx *eventTransaction) Commit(context.Context) error                     { return nil }
func (tx *eventTransaction) Rollback(context.Context) error                   { return nil }

type eventRow struct{}

func (eventRow) Scan(dest ...any) error { *dest[0].(*string) = "account"; return nil }
