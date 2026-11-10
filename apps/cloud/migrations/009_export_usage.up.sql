-- Keep monthly export accounting after expired artifacts/jobs are cleaned up.
CREATE UNIQUE INDEX usage_export_request_id ON usage_logs(resource_id) WHERE action='export.request';
INSERT INTO usage_logs(user_id,action,resource_type,resource_id,created_at)
SELECT user_id,'export.request','export',id::text,created_at FROM export_jobs
ON CONFLICT (resource_id) WHERE action='export.request' DO NOTHING;
