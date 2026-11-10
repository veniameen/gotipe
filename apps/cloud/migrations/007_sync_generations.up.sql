-- Pin replication records to the immutable document object used as their base.
-- A concurrent REST replacement cannot make an old room's late write visible.
ALTER TABLE document_updates ADD COLUMN generation_key TEXT;
ALTER TABLE document_snapshots ADD COLUMN generation_key TEXT;
UPDATE document_updates u SET generation_key = d.r2_key FROM documents d WHERE u.document_id = d.id;
UPDATE document_snapshots s SET generation_key = d.r2_key FROM documents d WHERE s.document_id = d.id;
ALTER TABLE document_updates ALTER COLUMN generation_key SET NOT NULL;
ALTER TABLE document_snapshots ALTER COLUMN generation_key SET NOT NULL;
CREATE INDEX idx_document_updates_generation ON document_updates (document_id, generation_key, id);
CREATE INDEX idx_document_snapshots_generation ON document_snapshots (document_id, generation_key, id DESC);
