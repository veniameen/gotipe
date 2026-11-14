//go:build integration

package main

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/gotipe/cloud/internal/storage"
	cloudsync "github.com/gotipe/cloud/internal/sync"
	"github.com/gotipe/cloud/internal/testdb"
	"github.com/jackc/pgx/v5/pgxpool"
)

func compactionDocument(t *testing.T, db *storage.PostgresStore, email, generation string) string {
	t.Helper()
	ctx := context.Background()
	var userID, docID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES($1)RETURNING id`, email).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key)VALUES($1,$2)RETURNING id`, userID, generation).Scan(&docID); err != nil {
		t.Fatal(err)
	}
	return docID
}
func storedRows(t *testing.T, db *storage.PostgresStore, table, docID string) int {
	t.Helper()
	var count int
	if err := db.Pool.QueryRow(context.Background(), "SELECT count(*) FROM "+table+" WHERE document_id=$1", docID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}
func replayedFrom(t *testing.T, store *dbPersistenceStore, docID string) string {
	t.Helper()
	state, err := store.LoadState(context.Background(), docID)
	if err != nil {
		t.Fatal(err)
	}
	merged, err := cloudsync.MergeUpdates(state.Updates)
	if err != nil {
		t.Fatal(err)
	}
	return string(merged)
}

// A row whose transaction commits after compaction read the log must survive:
// it was not merged, so deleting it would lose an acknowledged operation.
func TestCompactLogKeepsRowCommittedAfterItsRead(t *testing.T) {
	db := testdb.Open(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	docID := compactionDocument(t, db, "compaction@test.invalid", "generation")
	base := []byte(`{"blocks":[],"version":0}`)
	store := &dbPersistenceStore{db: db, r2: &syncTestObjects{data: base}, compactRows: 3}
	for clock := 1; clock <= 3; clock++ {
		if err := store.SaveUpdate(ctx, docID, "generation", operationsRecord("a", clock)); err != nil {
			t.Fatal(err)
		}
	}
	// An insert that only references the document does not take the lock
	// compaction needs, like a writer from before row locking was added.
	late, err := db.Pool.(*pgxpool.Pool).Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer late.Rollback(ctx)
	if _, err := late.Exec(ctx, `INSERT INTO document_updates(document_id,data,generation_key)VALUES($1,$2,'generation')`, docID, operationsRecord("late", 9)); err != nil {
		t.Fatal(err)
	}
	if err := store.CompactLog(ctx, docID, "generation"); err != nil {
		t.Fatal(err)
	}
	if rows := storedRows(t, db, "document_updates", docID); rows != 1 {
		t.Fatalf("committed rows after compaction: %d", rows)
	}
	if err := late.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if rows := storedRows(t, db, "document_updates", docID); rows != 2 {
		t.Fatalf("the late row did not survive: %d rows", rows)
	}
	want, _ := cloudsync.MergeUpdates([][]byte{operationsRecord("a", 1, 2, 3), operationsRecord("late", 9)})
	if got := replayedFrom(t, store, docID); got != string(want) {
		t.Fatalf("replay lost or invented operations: %s", got)
	}
	// The next compaction merges the survivor; the replay stays the same union.
	if err := store.SaveUpdate(ctx, docID, "generation", operationsRecord("a", 4)); err != nil {
		t.Fatal(err)
	}
	if err := store.CompactLog(ctx, docID, "generation"); err != nil {
		t.Fatal(err)
	}
	want, _ = cloudsync.MergeUpdates([][]byte{operationsRecord("a", 1, 2, 3, 4), operationsRecord("late", 9)})
	if rows := storedRows(t, db, "document_updates", docID); rows != 1 || replayedFrom(t, store, docID) != string(want) {
		t.Fatalf("second compaction: %d rows", rows)
	}
}

// Saves of the same document wait for a compaction and are neither lost nor merged twice.
func TestCompactLogSerializesWithConcurrentSaves(t *testing.T) {
	db := testdb.Open(t)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	docID := compactionDocument(t, db, "concurrent@test.invalid", "generation")
	store := &dbPersistenceStore{db: db, r2: &syncTestObjects{data: []byte(`{"blocks":[],"version":0}`)}, compactRows: 2}
	saved := make(chan error, 1)
	go func() {
		for clock := 1; clock <= 60; clock++ {
			if err := store.SaveUpdate(ctx, docID, "generation", operationsRecord("a", clock)); err != nil {
				saved <- err
				return
			}
		}
		saved <- nil
	}()
	for done := false; !done; {
		select {
		case err := <-saved:
			if err != nil {
				t.Fatal(err)
			}
			done = true
		default:
			if err := store.CompactLog(ctx, docID, "generation"); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := store.CompactLog(ctx, docID, "generation"); err != nil {
		t.Fatal(err)
	}
	clocks := make([]int, 60)
	for index := range clocks {
		clocks[index] = index + 1
	}
	want, _ := cloudsync.MergeUpdates([][]byte{operationsRecord("a", clocks...)})
	if got := replayedFrom(t, store, docID); got != string(want) {
		t.Fatalf("operations were lost between saves and compactions: %s", got)
	}
}

func TestCompactLogRefusesReplacedGenerationAndRemovesOldCheckpoints(t *testing.T) {
	db := testdb.Open(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	docID := compactionDocument(t, db, "legacy@test.invalid", "generation")
	base := []byte(`{"blocks":[],"version":0}`)
	store := &dbPersistenceStore{db: db, r2: &syncTestObjects{data: base}}
	// Records of a server from before generations: rows and checkpoints repeat the baseline.
	for clock := 1; clock <= 2; clock++ {
		if _, err := db.Pool.Exec(ctx, `INSERT INTO document_updates(document_id,data,generation_key)VALUES($1,$2,'generation')`, docID, legacyRecord(base, "old", clock)); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Pool.Exec(ctx, `INSERT INTO document_snapshots(document_id,data,version,generation_key)VALUES($1,$2,0,'generation')`, docID, legacyRecord(base, "old", 1, clock)); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.CompactLog(ctx, docID, "another"); !errors.Is(err, cloudsync.ErrBaselineReplaced) {
		t.Fatalf("a replaced generation was compacted: %v", err)
	}
	if storedRows(t, db, "document_updates", docID) != 2 || storedRows(t, db, "document_snapshots", docID) != 2 {
		t.Fatal("a refused compaction changed storage")
	}
	before := replayedFrom(t, store, docID)
	if err := store.CompactLog(ctx, docID, "generation"); err != nil {
		t.Fatal(err)
	}
	if storedRows(t, db, "document_updates", docID) != 1 || storedRows(t, db, "document_snapshots", docID) != 0 {
		t.Fatal("old rows or checkpoints remain after compaction")
	}
	if after := replayedFrom(t, store, docID); after != before {
		t.Fatalf("replay changed: %s", after)
	}
	// A REST replacement after compaction invalidates the merged row like any other.
	if _, err := db.Pool.Exec(ctx, `WITH changed AS(UPDATE documents SET r2_key='next' WHERE id=$1 RETURNING id)
	 DELETE FROM document_updates USING changed WHERE document_id=changed.id`, docID); err != nil {
		t.Fatal(err)
	}
	if state, err := store.LoadState(ctx, docID); err != nil || state.Generation != "next" || len(state.Updates) != 0 {
		t.Fatalf("replacement left the old log: %v", err)
	}
}
