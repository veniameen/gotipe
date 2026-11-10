ALTER TABLE export_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE export_jobs ADD COLUMN started_at TIMESTAMPTZ;
CREATE INDEX idx_webhooks_processing ON pending_webhooks(last_attempt_at) WHERE status='processing';
