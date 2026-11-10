DROP INDEX IF EXISTS idx_document_updates_generation;
DROP INDEX IF EXISTS idx_document_snapshots_generation;
ALTER TABLE document_updates DROP COLUMN generation_key;
ALTER TABLE document_snapshots DROP COLUMN generation_key;
