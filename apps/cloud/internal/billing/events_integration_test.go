//go:build integration

package billing

import (
	"context"
	"github.com/gotipe/cloud/internal/testdb"
	"github.com/stripe/stripe-go/v81"
	"sync/atomic"
	"testing"
	"time"
)

func TestSubscriptionReconciliationUsesActualDatabase(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var userID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email,stripe_customer_id)VALUES('billing@test.invalid','cus')RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	current := currentSubscription()
	p := &EventProcessor{DB: db.Pool, Prices: map[string]string{"pro": "price_pro"}, Subscriptions: subscriptionReader(func(string) (*stripe.Subscription, error) { return current, nil })}
	event := &stripe.Event{Type: "customer.subscription.updated", Data: &stripe.EventData{Raw: []byte(`{"id":"sub"}`)}}
	for _, step := range []struct {
		status stripe.SubscriptionStatus
		want   string
	}{{stripe.SubscriptionStatusActive, "pro"}, {stripe.SubscriptionStatusPastDue, "free"}, {stripe.SubscriptionStatusActive, "pro"}, {stripe.SubscriptionStatusCanceled, "free"}} {
		current.Status = step.status
		if err := p.Process(ctx, event); err != nil {
			t.Fatal(err)
		}
		if err := p.Process(ctx, event); err != nil {
			t.Fatal("duplicate event:", err)
		}
		var plan string
		var count int
		if err := db.Pool.QueryRow(ctx, `SELECT plan,(SELECT count(*) FROM subscriptions WHERE user_id=$1) FROM users WHERE id=$1`, userID).Scan(&plan, &count); err != nil {
			t.Fatal(err)
		}
		if plan != step.want || count != 1 {
			t.Fatalf("plan=%s count=%d", plan, count)
		}
	}
}

func TestReconciliationSerializesProviderFetchAndDatabaseWrite(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	if _, err := db.Pool.Exec(ctx, `INSERT INTO users(email,stripe_customer_id)VALUES('billing-race@test.invalid','cus')`); err != nil {
		t.Fatal(err)
	}
	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	secondStarted := make(chan struct{})
	var calls atomic.Int32
	reader := subscriptionReader(func(string) (*stripe.Subscription, error) {
		current := currentSubscription()
		if calls.Add(1) == 1 {
			close(firstStarted)
			<-releaseFirst
		} else {
			close(secondStarted)
			current.Status = stripe.SubscriptionStatusCanceled
		}
		return current, nil
	})
	processor := &EventProcessor{DB: db.Pool, Subscriptions: reader, Prices: map[string]string{"pro": "price_pro"}}
	event := &stripe.Event{Type: "customer.subscription.updated", Data: &stripe.EventData{Raw: []byte(`{"id":"sub"}`)}}
	results := make(chan error, 2)
	go func() { results <- processor.Process(ctx, event) }()
	<-firstStarted
	go func() { results <- processor.Process(ctx, event) }()
	select {
	case <-secondStarted:
		close(releaseFirst)
		t.Fatal("concurrent provider fetch can overwrite newer state")
	case <-time.After(100 * time.Millisecond):
	}
	close(releaseFirst)
	for i := 0; i < 2; i++ {
		select {
		case err := <-results:
			if err != nil {
				t.Fatal(err)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("reconciliation blocked")
		}
	}
	var plan string
	if err := db.Pool.QueryRow(ctx, `SELECT plan FROM users WHERE stripe_customer_id='cus'`).Scan(&plan); err != nil {
		t.Fatal(err)
	}
	if plan != "free" || calls.Load() != 2 {
		t.Fatalf("stale reconciliation plan=%s calls=%d", plan, calls.Load())
	}
}
