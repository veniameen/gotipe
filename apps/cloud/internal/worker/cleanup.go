package worker

import (
	"context"
	"log/slog"
	"time"

	"github.com/gotipe/cloud/internal/storage"
)

// CleanupWorker runs hourly to clean up orphan resources
type CleanupWorker struct {
	db     *storage.PostgresStore
	r2     *storage.R2Store
	valkey *storage.ValkeyStore
	log    *slog.Logger
}

func NewCleanupWorker(db *storage.PostgresStore, r2 *storage.R2Store, valkey *storage.ValkeyStore, log *slog.Logger) *CleanupWorker {
	return &CleanupWorker{db: db, r2: r2, valkey: valkey, log: log}
}

func (w *CleanupWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	w.log.Info("cleanup worker started")

	for {
		select {
		case <-ticker.C:
			w.run(ctx)
		case <-ctx.Done():
			w.log.Info("cleanup worker stopped")
			return
		}
	}
}

func (w *CleanupWorker) run(ctx context.Context) {
	w.log.Info("running cleanup")

	// 1. Delete orphan export jobs (completed > 24h ago, or failed > 7d ago)
	result, err := w.db.Pool.Exec(ctx,
		`DELETE FROM export_jobs
		 WHERE (status = 'completed' AND completed_at < now() - interval '24 hours')
		    OR (status = 'failed' AND created_at < now() - interval '7 days')`,
	)
	if err != nil {
		w.log.Error("cleanup export jobs failed", "error", err)
	} else {
		w.log.Info("cleaned up export jobs", "deleted", result.RowsAffected())
	}

	// 2. Delete expired API keys
	result, err = w.db.Pool.Exec(ctx,
		`DELETE FROM api_keys WHERE expires_at IS NOT NULL AND expires_at < now()`,
	)
	if err != nil {
		w.log.Error("cleanup expired api keys failed", "error", err)
	} else if result.RowsAffected() > 0 {
		w.log.Info("cleaned up expired api keys", "deleted", result.RowsAffected())
	}

	// 3. Delete old processed webhooks (> 7 days)
	result, err = w.db.Pool.Exec(ctx,
		`DELETE FROM pending_webhooks WHERE status = 'processed' AND processed_at < now() - interval '7 days'`,
	)
	if err != nil {
		w.log.Error("cleanup processed webhooks failed", "error", err)
	} else if result.RowsAffected() > 0 {
		w.log.Info("cleaned up processed webhooks", "deleted", result.RowsAffected())
	}

	// 4. Delete old audit logs (> 90 days for free plan)
	result, err = w.db.Pool.Exec(ctx,
		`DELETE FROM audit_log
		 WHERE created_at < now() - interval '90 days'
		 AND user_id IN (SELECT id FROM users WHERE plan = 'free')`,
	)
	if err != nil {
		w.log.Error("cleanup old audit logs failed", "error", err)
	} else if result.RowsAffected() > 0 {
		w.log.Info("cleaned up old audit logs", "deleted", result.RowsAffected())
	}

	// 5. Delete old usage logs (> 90 days)
	result, err = w.db.Pool.Exec(ctx,
		`DELETE FROM usage_logs WHERE created_at < now() - interval '90 days'`,
	)
	if err != nil {
		w.log.Error("cleanup old usage logs failed", "error", err)
	} else if result.RowsAffected() > 0 {
		w.log.Info("cleaned up old usage logs", "deleted", result.RowsAffected())
	}

	w.log.Info("cleanup complete")
}
