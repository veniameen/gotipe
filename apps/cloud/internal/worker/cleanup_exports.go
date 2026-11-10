package worker

import "context"

// Keep the database pointer until object deletion succeeds, so transient object
// storage failures remain retryable. Each run is bounded to 200 expired jobs.
func (w *CleanupWorker) cleanupExports(ctx context.Context) {
	rows, err := w.db.Pool.Query(ctx, `SELECT id,COALESCE(r2_key,'') FROM export_jobs
  WHERE (status='completed' AND completed_at<now()-interval '24 hours')
  OR (status='failed' AND created_at<now()-interval '7 days') ORDER BY created_at LIMIT 200`)
	if err != nil {
		w.log.Error("cleanup exports query failed", "error", err)
		return
	}
	type expired struct{ id, key string }
	jobs := []expired{}
	for rows.Next() {
		var job expired
		if err = rows.Scan(&job.id, &job.key); err != nil {
			break
		}
		jobs = append(jobs, job)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		w.log.Error("cleanup exports unreadable", "error", err)
		return
	}
	for _, job := range jobs {
		if ctx.Err() != nil {
			return
		}
		if job.key != "" {
			if err = w.r2.Delete(ctx, job.key); err != nil {
				w.log.Warn("cleanup export object failed", "id", job.id, "error", err)
				continue
			}
		}
		if _, err = w.db.Pool.Exec(ctx, `DELETE FROM export_jobs WHERE id=$1 AND status IN('completed','failed') AND COALESCE(r2_key,'')=$2`, job.id, job.key); err != nil {
			w.log.Error("cleanup export metadata failed", "id", job.id, "error", err)
		}
	}
}
