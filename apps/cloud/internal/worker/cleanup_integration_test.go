//go:build integration

package worker

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/gotipe/cloud/internal/storage"
	"github.com/gotipe/cloud/internal/testdb"
)

type cleanupObjects struct {
	storage.ObjectStore
	fail    bool
	deleted []string
}

func (s *cleanupObjects) Delete(_ context.Context, key string) error {
	if s.fail {
		return errors.New("storage unavailable")
	}
	s.deleted = append(s.deleted, key)
	return nil
}

func TestCleanupRetainsFailedObjectDeletionForRetryAndKeepsUsage(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var userID, docID, jobID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES('cleanup@test.invalid')RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key)VALUES($1,'baseline')RETURNING id`, userID).Scan(&docID); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO export_jobs(user_id,document_id,format,status,r2_key,completed_at)VALUES($1,$2,'pdf','completed','exports/file.pdf',now()-interval '2 days')RETURNING id`, userID, docID).Scan(&jobID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO usage_logs(user_id,action,resource_type,resource_id)VALUES($1,'export.request','export',$2)`, userID, jobID); err != nil {
		t.Fatal(err)
	}
	objects := &cleanupObjects{fail: true}
	w := NewCleanupWorker(db, objects, slog.New(slog.NewTextHandler(io.Discard, nil)))
	w.run(ctx)
	var count int
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM export_jobs WHERE id=$1`, jobID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("failed object deletion lost its durable pointer")
	}
	objects.fail = false
	w.run(ctx)
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM export_jobs WHERE id=$1`, jobID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 || len(objects.deleted) != 1 {
		t.Fatalf("jobs=%d deletes=%v", count, objects.deleted)
	}
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM usage_logs WHERE resource_id=$1`, jobID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("artifact cleanup reset monthly usage")
	}
}

func TestRetiredObjectsAreQueuedTransactionallyAndKeepLiveVersionReferences(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var userID, docID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES('retired@test.invalid')RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key)VALUES($1,'old')RETURNING id`, userID).Scan(&docID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO versions(document_id,name,created_by,snapshot_key)VALUES($1,'shared reference',$2,'old');`, docID, userID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE documents SET r2_key='current' WHERE id=$1`, docID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE object_deletions SET created_at=now()-interval '2 hours'`); err != nil {
		t.Fatal(err)
	}
	objects := &cleanupObjects{}
	w := NewCleanupWorker(db, objects, slog.New(slog.NewTextHandler(io.Discard, nil)))
	w.cleanupRetiredObjects(ctx)
	if len(objects.deleted) != 0 {
		t.Fatal("retired baseline still referenced by a version was deleted")
	}
	// Cascading document deletion queues both its current object and its version.
	if _, err := db.Pool.Exec(ctx, `DELETE FROM documents WHERE id=$1`, docID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE object_deletions SET created_at=now()-interval '2 hours'`); err != nil {
		t.Fatal(err)
	}
	objects.fail = true
	w.cleanupRetiredObjects(ctx)
	var count int
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM object_deletions`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("cascade lost pointers: %d", count)
	}
	objects.fail = false
	w.cleanupRetiredObjects(ctx)
	if len(objects.deleted) != 2 {
		t.Fatalf("retired objects not deleted: %v", objects.deleted)
	}
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM object_deletions`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("acknowledged deletions remain: %d", count)
	}
}
