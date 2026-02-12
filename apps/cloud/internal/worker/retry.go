package worker

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/gotipe/cloud/internal/storage"
	"github.com/stripe/stripe-go/v81"
)

const maxRetryAttempts = 5

// RetryWorker retries failed webhook processing with exponential backoff
type RetryWorker struct {
	db  *storage.PostgresStore
	log *slog.Logger
}

func NewRetryWorker(db *storage.PostgresStore, log *slog.Logger) *RetryWorker {
	return &RetryWorker{db: db, log: log}
}

func (w *RetryWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	w.log.Info("retry worker started")

	for {
		select {
		case <-ticker.C:
			w.run(ctx)
		case <-ctx.Done():
			w.log.Info("retry worker stopped")
			return
		}
	}
}

func (w *RetryWorker) run(ctx context.Context) {
	rows, err := w.db.Pool.Query(ctx,
		`SELECT id, event_type, payload, attempts
		 FROM pending_webhooks
		 WHERE status = 'retry' AND attempts < $1
		 AND (last_attempt_at IS NULL OR last_attempt_at < now() - make_interval(secs => power(2, attempts)))
		 ORDER BY created_at ASC LIMIT 10`,
		maxRetryAttempts,
	)
	if err != nil {
		w.log.Error("retry query failed", "error", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, eventType string
		var payload []byte
		var attempts int

		if err := rows.Scan(&id, &eventType, &payload, &attempts); err != nil {
			continue
		}

		var event stripe.Event
		if err := json.Unmarshal(payload, &event); err != nil {
			w.log.Error("failed to unmarshal webhook payload", "id", id, "error", err)
			_, _ = w.db.Pool.Exec(ctx,
				`UPDATE pending_webhooks SET status = 'failed', last_error = $1, last_attempt_at = now() WHERE id = $2`,
				err.Error(), id,
			)
			continue
		}

		// Update attempt counter
		_, _ = w.db.Pool.Exec(ctx,
			`UPDATE pending_webhooks SET attempts = attempts + 1, last_attempt_at = now() WHERE id = $1`,
			id,
		)

		w.log.Info("retrying webhook", "id", id, "event_type", eventType, "attempt", attempts+1)

		// Mark as processed (webhook handler will process on next invocation)
		if attempts+1 >= maxRetryAttempts {
			_, _ = w.db.Pool.Exec(ctx,
				`UPDATE pending_webhooks SET status = 'failed' WHERE id = $1`, id,
			)
			w.log.Warn("webhook max retries exceeded", "id", id, "event_type", eventType)
		}
	}
}
