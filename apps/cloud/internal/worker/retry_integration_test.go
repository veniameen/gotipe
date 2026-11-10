//go:build integration

package worker

import (
	"context"
	"errors"
	"github.com/gotipe/cloud/internal/testdb"
	"github.com/stripe/stripe-go/v81"
	"io"
	"log/slog"
	"testing"
)

type eventProcessor func(*stripe.Event) error

func (f eventProcessor) Process(_ context.Context, event *stripe.Event) error { return f(event) }

func TestRetryWorkerProcessesAndRetriesDurableQueue(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	for _, id := range []string{"ok", "retry", "exhausted"} {
		attempts := 0
		if id == "exhausted" {
			attempts = 4
		}
		if _, err := db.Pool.Exec(ctx, `INSERT INTO pending_webhooks(id,event_type,payload,attempts)VALUES($1,'test',$2,$3)`, id, []byte(`{"id":"`+id+`","type":"test"}`), attempts); err != nil {
			t.Fatal(err)
		}
	}
	calls := map[string]int{}
	w := NewRetryWorker(db, slog.New(slog.NewTextHandler(io.Discard, nil)), eventProcessor(func(event *stripe.Event) error {
		calls[event.ID]++
		if event.ID != "ok" {
			return errors.New("provider temporarily unavailable")
		}
		return nil
	}))
	for i := 0; i < 3; i++ {
		w.run(ctx)
	}
	for id, want := range map[string]string{"ok": "processed", "retry": "retry", "exhausted": "failed"} {
		var status string
		if err := db.Pool.QueryRow(ctx, `SELECT status FROM pending_webhooks WHERE id=$1`, id).Scan(&status); err != nil {
			t.Fatal(err)
		}
		if status != want || calls[id] != 1 {
			t.Fatalf("%s status=%s calls=%d", id, status, calls[id])
		}
	}
	w.run(ctx)
	if calls["ok"] != 1 || calls["retry"] != 1 {
		t.Fatal("duplicate processing or ignored backoff")
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE pending_webhooks SET last_attempt_at=now()-interval '1 hour' WHERE id='retry'`); err != nil {
		t.Fatal(err)
	}
	w.processor = eventProcessor(func(event *stripe.Event) error { calls[event.ID]++; return nil })
	w.run(ctx)
	var status string
	if err := db.Pool.QueryRow(ctx, `SELECT status FROM pending_webhooks WHERE id='retry'`).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "processed" || calls["retry"] != 2 {
		t.Fatalf("retry status=%s calls=%d", status, calls["retry"])
	}
}

func TestAbandonedFinalWebhookLeaseBecomesFailed(t *testing.T) {
	db := testdb.Open(t)
	if _, err := db.Pool.Exec(context.Background(), `INSERT INTO pending_webhooks(id,event_type,payload,status,attempts,last_attempt_at) VALUES('abandoned','test','{}','processing',5,now()-interval '6 minutes')`); err != nil {
		t.Fatal(err)
	}
	w := NewRetryWorker(db, slog.New(slog.NewTextHandler(io.Discard, nil)), eventProcessor(func(*stripe.Event) error { t.Fatal("exhausted event retried"); return nil }))
	w.run(context.Background())
	var status string
	if err := db.Pool.QueryRow(context.Background(), `SELECT status FROM pending_webhooks WHERE id='abandoned'`).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "failed" {
		t.Fatalf("abandoned lease remains %s", status)
	}
}
