DELETE FROM usage_logs WHERE action='export.request';
DROP INDEX usage_export_request_id;
