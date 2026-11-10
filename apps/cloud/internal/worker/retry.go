package worker

import (
	"context"
	"encoding/json"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/stripe/stripe-go/v81"
	"log/slog"
	"time"
)

const maxRetryAttempts = 5

type WebhookProcessor interface {
	Process(context.Context, *stripe.Event) error
}
type RetryWorker struct {
	db        *storage.PostgresStore
	log       *slog.Logger
	processor WebhookProcessor
}

func NewRetryWorker(db *storage.PostgresStore, log *slog.Logger, processor WebhookProcessor) *RetryWorker {
	return &RetryWorker{db: db, log: log, processor: processor}
}
func (w *RetryWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		w.run(ctx)
		select {
		case <-ticker.C:
		case <-ctx.Done():
			return
		}
	}
}
func (w *RetryWorker) run(ctx context.Context) {
	if _, err := w.db.Pool.Exec(ctx, `UPDATE pending_webhooks SET status='failed',last_error='Worker lease expired after final attempt'
        WHERE status='processing' AND attempts >= $1 AND last_attempt_at<now()-interval '5 minutes'`, maxRetryAttempts); err != nil {
		w.log.Error("webhook exhausted lease cleanup failed", "error", err)
		return
	}
	// SKIP LOCKED permits multiple workers. Abandoned claims expire in 5 minutes.
	rows, err := w.db.Pool.Query(ctx, `WITH next AS (
		SELECT id FROM pending_webhooks WHERE attempts<$1 AND (
		status='pending' OR (status='retry' AND last_attempt_at<now()-make_interval(secs=>power(2,attempts)::double precision))
		OR (status='processing' AND last_attempt_at<now()-interval '5 minutes'))
		ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
	) UPDATE pending_webhooks SET status='processing',attempts=attempts+1,last_attempt_at=now()
	WHERE id IN(SELECT id FROM next) RETURNING id,payload,attempts`, maxRetryAttempts)
	if err != nil {
		w.log.Error("webhook claim failed", "error", err)
		return
	}
	type job struct {
		id      string
		payload []byte
		attempt int
	}
	jobs := []job{}
	for rows.Next() {
		var j job
		if err = rows.Scan(&j.id, &j.payload, &j.attempt); err != nil {
			break
		}
		jobs = append(jobs, j)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		w.log.Error("webhook claims unreadable", "error", err)
		return
	}
	for _, j := range jobs {
		var event stripe.Event
		err = json.Unmarshal(j.payload, &event)
		if err == nil {
			processCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
			err = w.processor.Process(processCtx, &event)
			cancel()
		}
		status := "processed"
		var message *string
		if err != nil {
			value := err.Error()
			message = &value
			status = "retry"
			if j.attempt >= maxRetryAttempts {
				status = "failed"
			}
		}
		saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		_, saveErr := w.db.Pool.Exec(saveCtx, `UPDATE pending_webhooks SET status=$1,last_error=$2,
		processed_at=CASE WHEN $1='processed' THEN now() ELSE NULL END
		WHERE id=$3 AND attempts=$4 AND status='processing'`, status, message, j.id, j.attempt)
		cancel()
		if saveErr != nil {
			w.log.Error("webhook result persistence failed", "id", j.id, "error", saveErr)
		}
		if err != nil {
			w.log.Warn("webhook processing failed", "id", j.id, "attempt", j.attempt, "error", err)
		}
	}
}
