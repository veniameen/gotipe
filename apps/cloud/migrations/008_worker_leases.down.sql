DROP INDEX IF EXISTS idx_webhooks_processing;
ALTER TABLE export_jobs DROP COLUMN started_at;
ALTER TABLE export_jobs DROP COLUMN attempts;
