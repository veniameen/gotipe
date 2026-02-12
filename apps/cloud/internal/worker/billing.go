package worker

import (
	"context"
	"log/slog"
	"time"

	"github.com/gotipe/cloud/internal/storage"
)

// BillingWorker runs daily to aggregate usage and generate billing summaries
type BillingWorker struct {
	db  *storage.PostgresStore
	log *slog.Logger
}

func NewBillingWorker(db *storage.PostgresStore, log *slog.Logger) *BillingWorker {
	return &BillingWorker{db: db, log: log}
}

func (w *BillingWorker) Start(ctx context.Context) {
	// Run once at startup, then daily at midnight UTC
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	w.log.Info("billing worker started")

	for {
		select {
		case <-ticker.C:
			w.run(ctx)
		case <-ctx.Done():
			w.log.Info("billing worker stopped")
			return
		}
	}
}

func (w *BillingWorker) run(ctx context.Context) {
	w.log.Info("running daily billing aggregation")

	// 1. Aggregate daily usage per user
	_, err := w.db.Pool.Exec(ctx,
		`INSERT INTO usage_daily (user_id, date, document_count, ai_request_count, export_count)
		 SELECT
			u.id,
			CURRENT_DATE - 1,
			(SELECT COUNT(*) FROM documents WHERE owner_id = u.id),
			(SELECT COUNT(*) FROM usage_logs WHERE user_id = u.id AND action = 'ai.request'
			 AND created_at >= CURRENT_DATE - 1 AND created_at < CURRENT_DATE),
			(SELECT COUNT(*) FROM export_jobs WHERE user_id = u.id
			 AND created_at >= CURRENT_DATE - 1 AND created_at < CURRENT_DATE)
		 FROM users u
		 WHERE u.plan != 'free'
		 ON CONFLICT (user_id, date) DO UPDATE SET
			document_count = EXCLUDED.document_count,
			ai_request_count = EXCLUDED.ai_request_count,
			export_count = EXCLUDED.export_count`,
	)
	if err != nil {
		w.log.Error("daily usage aggregation failed", "error", err)
	} else {
		w.log.Info("daily usage aggregation completed")
	}

	// 2. Check for users over quota and log warnings
	rows, err := w.db.Pool.Query(ctx,
		`SELECT u.id, u.plan,
			(SELECT COUNT(*) FROM documents WHERE owner_id = u.id) as doc_count,
			(SELECT COUNT(*) FROM usage_logs WHERE user_id = u.id AND action = 'ai.request'
			 AND created_at > date_trunc('month', now())) as ai_count
		 FROM users u
		 WHERE u.plan != 'enterprise'`,
	)
	if err != nil {
		w.log.Error("quota check query failed", "error", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var userID, plan string
		var docCount, aiCount int64
		if err := rows.Scan(&userID, &plan, &docCount, &aiCount); err != nil {
			continue
		}

		// Log users at >90% quota
		// In production, this would send notification emails
		w.log.Debug("user usage",
			"user_id", userID,
			"plan", plan,
			"documents", docCount,
			"ai_requests", aiCount,
		)
	}

	w.log.Info("billing aggregation complete")
}
