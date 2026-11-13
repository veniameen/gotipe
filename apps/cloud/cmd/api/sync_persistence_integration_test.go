//go:build integration

package main

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/gotipe/cloud/internal/storage"
	cloudsync "github.com/gotipe/cloud/internal/sync"
	"github.com/gotipe/cloud/internal/testdb"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// delayedInsert holds the real INSERT uncommitted while another connection
// replaces the document. This reproduces the MVCC race a fake DB cannot model.
type delayedInsert struct {
	storage.ConnectionPool
	pool     *pgxpool.Pool
	inserted chan struct{}
	commit   chan struct{}
}

func (p *delayedInsert) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if !strings.HasPrefix(sql, "INSERT INTO document_") {
		return p.ConnectionPool.Exec(ctx, sql, args...)
	}
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return pgconn.CommandTag{}, err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, sql, args...)
	if err != nil {
		return tag, err
	}
	close(p.inserted)
	select {
	case <-p.commit:
	case <-ctx.Done():
		return tag, ctx.Err()
	}
	return tag, tx.Commit(ctx)
}

func TestSyncGenerationFiltersUpdateCommittedAfterRESTReplacement(t *testing.T) {
	for _, checkpoint := range []bool{false, true} {
		t.Run(map[bool]string{false: "update", true: "checkpoint"}[checkpoint], func(t *testing.T) {
			db := testdb.Open(t)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			var userID, docID string
			if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES('race@test.invalid')RETURNING id`).Scan(&userID); err != nil {
				t.Fatal(err)
			}
			if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key)VALUES($1,'old-generation')RETURNING id`, userID).Scan(&docID); err != nil {
				t.Fatal(err)
			}
			delayed := &delayedInsert{ConnectionPool: db.Pool, pool: db.Pool.(*pgxpool.Pool), inserted: make(chan struct{}), commit: make(chan struct{})}
			base := []byte(`{"blocks":[],"version":0}`)
			store := &dbPersistenceStore{db: &storage.PostgresStore{Pool: delayed}, r2: &syncTestObjects{data: base}}
			finished := make(chan error, 1)
			go func() {
				if checkpoint {
					finished <- store.SaveSnapshot(ctx, docID, "old-generation", syncEnvelope(base))
				} else {
					// Model an old in-flight writer during rolling upgrade. The new
					// SaveUpdate also changes metadata, serializing its row lock with REST.
					_, err := delayed.Exec(ctx, `INSERT INTO document_updates(document_id,data,generation_key)
					 SELECT id,$2,r2_key FROM documents WHERE id=$1 AND r2_key=$3`, docID, syncEnvelope(base), "old-generation")
					finished <- err
				}
			}()
			select {
			case <-delayed.inserted:
			case err := <-finished:
				t.Fatalf("insert failed before barrier: %v", err)
			case <-ctx.Done():
				t.Fatal(ctx.Err())
			}
			_, err := db.Pool.Exec(ctx, `WITH changed AS(UPDATE documents SET r2_key='new-generation' WHERE id=$1 RETURNING id),
		removed_updates AS(DELETE FROM document_updates USING changed WHERE document_id=changed.id),
		removed_snapshots AS(DELETE FROM document_snapshots USING changed WHERE document_id=changed.id)SELECT id FROM changed`, docID)
			close(delayed.commit)
			if err != nil {
				t.Fatal(err)
			}
			if err = <-finished; err != nil {
				t.Fatal(err)
			}
			// The stale row really survived the concurrent DELETE; generation
			// filtering, not an accidental lock serialization, makes it harmless.
			var stale int
			table := "document_updates"
			if checkpoint {
				table = "document_snapshots"
			}
			if err = db.Pool.QueryRow(ctx, "SELECT count(*) FROM "+pgx.Identifier{table}.Sanitize()+" WHERE document_id=$1 AND generation_key='old-generation'", docID).Scan(&stale); err != nil {
				t.Fatal(err)
			}
			if stale != 1 {
				t.Fatalf("race did not retain stale insert: %d", stale)
			}
			store.db = db
			state, err := store.LoadState(ctx, docID)
			if err != nil {
				t.Fatal(err)
			}
			if state.Generation != "new-generation" || len(state.Updates) != 0 {
				t.Fatalf("obsolete generation would be sent to reconnecting clients: %s %d", state.Generation, len(state.Updates))
			}
			if err = store.SaveUpdate(ctx, docID, "old-generation", syncEnvelope(base)); !errors.Is(err, cloudsync.ErrBaselineReplaced) {
				t.Fatalf("write pinned to the old generation was not refused: %v", err)
			}
			if err = store.SaveUpdate(ctx, docID, state.Generation, syncEnvelope(base)); err != nil {
				t.Fatal(err)
			}
			state, err = store.LoadState(ctx, docID)
			if err != nil || len(state.Updates) != 1 {
				t.Fatalf("current generation updates=%d err=%v", len(state.Updates), err)
			}
		})
	}
}

// A save of the old generation that waits for a REST replacement's row lock must
// insert nothing: under READ COMMITTED an INSERT that read the row before the lock
// wait would commit an orphan delta although the save reports a replaced baseline.
func TestSaveBlockedByRESTReplacementInsertsNoOldDelta(t *testing.T) {
	db := testdb.Open(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var userID, docID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES('blocked@test.invalid')RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key)VALUES($1,'old-generation')RETURNING id`, userID).Scan(&docID); err != nil {
		t.Fatal(err)
	}
	base := []byte(`{"blocks":[],"version":0}`)
	store := &dbPersistenceStore{db: db, r2: &syncTestObjects{data: base}}
	replacement, err := db.Pool.(*pgxpool.Pool).Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer replacement.Rollback(ctx)
	if _, err = replacement.Exec(ctx, `UPDATE documents SET r2_key='new-generation',version=version+1 WHERE id=$1`, docID); err != nil {
		t.Fatal(err)
	}
	saved := make(chan error, 1)
	go func() { saved <- store.SaveUpdate(ctx, docID, "old-generation", syncEnvelope(base)) }()
	for waiting := 0; waiting == 0; {
		if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		select {
		case err := <-saved:
			t.Fatalf("save finished before the replacement committed: %v", err)
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		case <-time.After(10 * time.Millisecond):
		}
	}
	if err = replacement.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err = <-saved; !errors.Is(err, cloudsync.ErrBaselineReplaced) {
		t.Fatalf("save during replacement was not reported as replaced: %v", err)
	}
	var deltas int
	if err = db.Pool.QueryRow(ctx, `SELECT count(*) FROM document_updates WHERE document_id=$1`, docID).Scan(&deltas); err != nil {
		t.Fatal(err)
	}
	if deltas != 0 {
		t.Fatalf("a delta of the replaced generation was inserted: %d", deltas)
	}
}

func TestDurableSyncUpdateAdvancesRESTRevisionAtomically(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var userID, docID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES('revision@test.invalid')RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key,updated_at)VALUES($1,'baseline',now()-interval '1 day')RETURNING id`, userID).Scan(&docID); err != nil {
		t.Fatal(err)
	}
	base := []byte(`{"blocks":[],"version":0}`)
	store := &dbPersistenceStore{db: db, r2: &syncTestObjects{data: base}}
	if err := store.SaveUpdate(ctx, docID, "baseline", syncEnvelope(base)); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveSnapshot(ctx, docID, "baseline", syncEnvelope(base)); err != nil {
		t.Fatal(err)
	}
	var version int64
	var key string
	var recent bool
	var count int
	if err := db.Pool.QueryRow(ctx, `SELECT version,r2_key,updated_at>now()-interval '1 minute',(SELECT count(*) FROM document_updates WHERE document_id=$1) FROM documents WHERE id=$1`, docID).Scan(&version, &key, &recent, &count); err != nil {
		t.Fatal(err)
	}
	if version != 2 || key != "baseline" || !recent || count != 1 {
		t.Fatalf("version=%d key=%s recent=%t deltas=%d", version, key, recent, count)
	}
	// A metadata failure must roll back the delta insertion in the same statement.
	if _, err := db.Pool.Exec(ctx, `UPDATE documents SET version=9223372036854775807 WHERE id=$1`, docID); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveUpdate(ctx, docID, "baseline", syncEnvelope(base)); err == nil {
		t.Fatal("overflow accepted")
	}
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM document_updates WHERE document_id=$1`, docID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatal("failed metadata update left a partially committed delta")
	}
}
