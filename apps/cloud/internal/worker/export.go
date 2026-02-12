package worker

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/gotipe/cloud/internal/handler"
	"github.com/gotipe/cloud/internal/storage"
)

// ExportWorker polls for pending export jobs and processes them
type ExportWorker struct {
	db           *storage.PostgresStore
	r2           *storage.R2Store
	log          *slog.Logger
	pollInterval time.Duration
	r2Prefix     string
}

func NewExportWorker(db *storage.PostgresStore, r2 *storage.R2Store, log *slog.Logger, pollInterval time.Duration, r2Prefix string) *ExportWorker {
	return &ExportWorker{
		db:           db,
		r2:           r2,
		log:          log,
		pollInterval: pollInterval,
		r2Prefix:     r2Prefix,
	}
}

func (w *ExportWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	w.log.Info("export worker started")

	for {
		select {
		case <-ticker.C:
			w.processJobs(ctx)
		case <-ctx.Done():
			w.log.Info("export worker stopped")
			return
		}
	}
}

func (w *ExportWorker) processJobs(ctx context.Context) {
	rows, err := w.db.Pool.Query(ctx,
		`UPDATE export_jobs SET status = 'processing'
		 WHERE id IN (
			SELECT id FROM export_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5
		 ) RETURNING id, document_id, format, user_id`,
	)
	if err != nil {
		w.log.Error("export job query failed", "error", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var jobID, docID, format, userID string
		if err := rows.Scan(&jobID, &docID, &format, &userID); err != nil {
			continue
		}

		go w.processJob(ctx, jobID, docID, format, userID)
	}
}

func (w *ExportWorker) processJob(ctx context.Context, jobID, docID, format, userID string) {
	w.log.Info("processing export job", "job_id", jobID, "document_id", docID, "format", format)

	// Get document R2 key
	var r2Key string
	err := w.db.Pool.QueryRow(ctx,
		`SELECT r2_key FROM documents WHERE id = $1`, docID,
	).Scan(&r2Key)
	if err != nil {
		w.failJob(ctx, jobID, "document not found")
		return
	}

	// Fetch document content
	content, err := w.r2.Get(ctx, r2Key)
	if err != nil {
		w.failJob(ctx, jobID, "failed to fetch document content")
		return
	}

	// Convert based on format
	var exported []byte
	var ext string

	switch format {
	case "html":
		exported = content // In production, would convert JSON → HTML via WASM
		ext = "html"
	case "markdown":
		exported = content // In production, would convert JSON → Markdown
		ext = "md"
	case "json":
		exported = content
		ext = "json"
	case "plaintext":
		exported = content // In production, would strip marks
		ext = "txt"
	case "pdf":
		exported = content // In production, would call typst
		ext = "pdf"
	case "docx":
		exported = content // In production, would call docx-rs
		ext = "docx"
	default:
		w.failJob(ctx, jobID, "unsupported format")
		return
	}

	// Upload to R2
	outputKey := fmt.Sprintf("%s%s/%s.%s", w.r2Prefix, docID, jobID, ext)
	if err := w.r2.Put(ctx, outputKey, exported); err != nil {
		w.failJob(ctx, jobID, "failed to upload export")
		return
	}

	// Mark as completed
	_, err = w.db.Pool.Exec(ctx,
		`UPDATE export_jobs SET status = 'completed', r2_key = $1, completed_at = now() WHERE id = $2`,
		outputKey, jobID,
	)
	if err != nil {
		w.log.Error("failed to update export job status", "job_id", jobID, "error", err)
	}

	handler.ExportJobsTotal.WithLabelValues(format, "completed").Inc()
	w.log.Info("export job completed", "job_id", jobID, "format", format)
}

func (w *ExportWorker) failJob(ctx context.Context, jobID, errMsg string) {
	_, _ = w.db.Pool.Exec(ctx,
		`UPDATE export_jobs SET status = 'failed', error_message = $1, completed_at = now() WHERE id = $2`,
		errMsg, jobID,
	)
	handler.ExportJobsTotal.WithLabelValues("unknown", "failed").Inc()
	w.log.Error("export job failed", "job_id", jobID, "error", errMsg)
}
