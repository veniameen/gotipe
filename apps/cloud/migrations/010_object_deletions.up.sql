-- Pointer changes and cascades durably retire immutable object keys in the same
-- transaction. The worker waits one hour and checks all remaining references.
CREATE TABLE object_deletions (
 object_key TEXT PRIMARY KEY,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION queue_retired_object() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_key TEXT;
BEGIN
 previous_key := to_jsonb(OLD)->>TG_ARGV[0];
 IF previous_key IS NOT NULL AND previous_key<>'' AND
   (TG_OP='DELETE' OR previous_key IS DISTINCT FROM (to_jsonb(NEW)->>TG_ARGV[0])) THEN
  INSERT INTO object_deletions(object_key)VALUES(previous_key)ON CONFLICT DO NOTHING;
 END IF;
 RETURN NULL;
END;
$$;
CREATE TRIGGER retire_document_object AFTER DELETE OR UPDATE OF r2_key ON documents
 FOR EACH ROW EXECUTE FUNCTION queue_retired_object('r2_key');
CREATE TRIGGER retire_version_object AFTER DELETE OR UPDATE OF snapshot_key ON versions
 FOR EACH ROW EXECUTE FUNCTION queue_retired_object('snapshot_key');
CREATE TRIGGER retire_export_object AFTER DELETE OR UPDATE OF r2_key ON export_jobs
 FOR EACH ROW EXECUTE FUNCTION queue_retired_object('r2_key');
