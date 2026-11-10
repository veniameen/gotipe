DROP TRIGGER retire_document_object ON documents;
DROP TRIGGER retire_version_object ON versions;
DROP TRIGGER retire_export_object ON export_jobs;
DROP FUNCTION queue_retired_object();
DROP TABLE object_deletions;
