package worker

import "context"

func (w *CleanupWorker) cleanupRetiredObjects(ctx context.Context) {
	rows, err := w.db.Pool.Query(ctx, `SELECT object_key FROM object_deletions q WHERE created_at<now()-interval '1 hour'
  AND NOT EXISTS(SELECT 1 FROM documents WHERE r2_key=q.object_key)
  AND NOT EXISTS(SELECT 1 FROM versions WHERE snapshot_key=q.object_key)
  AND NOT EXISTS(SELECT 1 FROM export_jobs WHERE r2_key=q.object_key)
  ORDER BY created_at LIMIT 200`)
	if err != nil {
		w.log.Error("retired objects query failed", "error", err)
		return
	}
	keys := []string{}
	for rows.Next() {
		var key string
		if err = rows.Scan(&key); err != nil {
			break
		}
		keys = append(keys, key)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		w.log.Error("retired object keys unreadable", "error", err)
		return
	}
	for _, key := range keys {
		if ctx.Err() != nil {
			return
		}
		if err = w.r2.Delete(ctx, key); err != nil {
			w.log.Warn("retired object deletion failed", "error", err)
			continue
		}
		if _, err = w.db.Pool.Exec(ctx, `DELETE FROM object_deletions WHERE object_key=$1`, key); err != nil {
			w.log.Error("retired object acknowledgement failed", "error", err)
		}
	}
}
