package worker

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gotipe/cloud/internal/conversion"
	"github.com/gotipe/cloud/internal/document"
	"github.com/gotipe/cloud/internal/handler"
	"github.com/gotipe/cloud/internal/storage"
)

// ExportWorker polls for pending export jobs and processes them
type ExportWorker struct {
	db           *storage.PostgresStore
	r2           storage.ObjectStore
	log          *slog.Logger
	pollInterval time.Duration
	r2Prefix     string
	converter    conversion.Converter
	contents     document.ContentReader
	options      ExportOptions
}

type ExportOptions struct {
	Workers          int
	MaxDocumentBytes int64
}

func NewExportWorker(db *storage.PostgresStore, r2 storage.ObjectStore, log *slog.Logger, pollInterval time.Duration, r2Prefix string, converter conversion.Converter, contents document.ContentReader, options ExportOptions) *ExportWorker {
	if options.Workers < 1 {
		options.Workers = 1
	}
	if options.Workers > 16 {
		options.Workers = 16
	}
	if options.MaxDocumentBytes < 1 {
		options.MaxDocumentBytes = 10 << 20
	}
	if pollInterval <= 0 {
		pollInterval = time.Second
	}
	return &ExportWorker{
		db:           db,
		r2:           r2,
		log:          log,
		pollInterval: pollInterval,
		r2Prefix:     r2Prefix,
		converter:    converter, contents: contents,
		options: options,
	}
}

func (w *ExportWorker) Start(ctx context.Context) {
	var workers sync.WaitGroup
	for i := 0; i < w.options.Workers; i++ {
		workers.Add(1)
		go func() { defer workers.Done(); w.work(ctx) }()
	}
	workers.Wait()
}

func (w *ExportWorker) work(ctx context.Context) {
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
	if _, err := w.db.Pool.Exec(ctx, `UPDATE export_jobs SET status='failed',error_message='Worker lease expired after final attempt',completed_at=now()
        WHERE status='processing' AND attempts>=5 AND started_at<now()-interval '10 minutes'`); err != nil {
		w.log.Error("export exhausted lease cleanup failed", "error", err)
		return
	}
	rows, err := w.db.Pool.Query(ctx,
		`UPDATE export_jobs SET status = 'processing',started_at=now(),attempts=attempts+1
		 WHERE id IN (
			SELECT id FROM export_jobs WHERE attempts<5 AND (status='pending' OR (status='processing' AND started_at<now()-interval '10 minutes'))
			ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
		 ) RETURNING id, document_id, format, user_id,attempts`,
	)
	if err != nil {
		w.log.Error("export job query failed", "error", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var jobID, docID, format, userID string
		var attempt int
		if err := rows.Scan(&jobID, &docID, &format, &userID, &attempt); err != nil {
			w.log.Error("export claim unreadable", "error", err)
			return
		}
		rows.Close()
		w.processJob(ctx, jobID, docID, format, userID, attempt)
		return
	}
	if rows.Err() != nil {
		w.log.Error("export claim iteration failed", "error", rows.Err())
	}
}

func (w *ExportWorker) processJob(ctx context.Context, jobID, docID, format, userID string, attempt int) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	w.log.Info("processing export job", "job_id", jobID, "document_id", docID, "format", format)

	// Get document R2 key
	var r2Key string
	err := w.db.Pool.QueryRow(ctx,
		`SELECT r2_key FROM documents WHERE id=$1 AND (owner_id=$2 OR id IN(SELECT document_id FROM document_permissions WHERE user_id=$2))`, docID, userID,
	).Scan(&r2Key)
	if err != nil {
		w.failJob(ctx, jobID, attempt, "document access unavailable")
		return
	}

	// Fetch document content
	content, err := w.contents.Load(ctx, docID, r2Key)
	if err != nil {
		w.failJob(ctx, jobID, attempt, "failed to fetch document content")
		return
	}
	if int64(len(content)) > w.options.MaxDocumentBytes {
		w.failJob(ctx, jobID, attempt, "document exceeds export size limit")
		return
	}

	exported, err := w.converter.Convert(ctx, format, content)
	if err != nil {
		w.failJob(ctx, jobID, attempt, err.Error())
		return
	}
	ext := map[string]string{"html": "html", "markdown": "md", "json": "json", "plaintext": "txt", "pdf": "pdf", "docx": "docx"}[format]
	if ext == "" {
		w.failJob(ctx, jobID, attempt, "unsupported format")
		return
	}

	// Upload to R2
	outputKey := fmt.Sprintf("%s%s/%s-%d.%s", w.r2Prefix, docID, jobID, attempt, ext)
	if err := w.r2.Put(ctx, outputKey, exported); err != nil {
		w.failJob(ctx, jobID, attempt, "failed to upload export")
		return
	}

	// Mark as completed
	tag, err := w.db.Pool.Exec(ctx,
		`UPDATE export_jobs SET status='completed',r2_key=$1,completed_at=now() WHERE id=$2 AND attempts=$3 AND status='processing'`,
		outputKey, jobID, attempt,
	)
	if err != nil {
		w.log.Error("failed to update export job status", "job_id", jobID, "error", err)
		return
	}
	if tag.RowsAffected() != 1 {
		w.log.Warn("export lease replaced", "job_id", jobID)
		return
	}

	handler.ExportJobsTotal.WithLabelValues(format, "completed").Inc()
	w.log.Info("export job completed", "job_id", jobID, "format", format)
}

func (w *ExportWorker) failJob(ctx context.Context, jobID string, attempt int, errMsg string) {
	_, err := w.db.Pool.Exec(ctx,
		`UPDATE export_jobs SET status='failed',error_message=$1,completed_at=now() WHERE id=$2 AND attempts=$3 AND status='processing'`,
		errMsg, jobID, attempt,
	)
	if err != nil {
		w.log.Error("export failure persistence failed", "job_id", jobID, "error", err)
		return
	}
	handler.ExportJobsTotal.WithLabelValues("unknown", "failed").Inc()
	w.log.Error("export job failed", "job_id", jobID, "error", errMsg)
}
