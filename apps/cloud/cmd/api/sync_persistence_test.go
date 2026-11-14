package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/gotipe/cloud/internal/storage"
	cloudsync "github.com/gotipe/cloud/internal/sync"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type syncTestPool struct {
	key            string
	rotateOnInsert bool
	inserts        int
	checkpoint     []byte
	updates        [][]byte
	generations    []string
}
type syncRow func(...any) error

func (r syncRow) Scan(values ...any) error { return r(values...) }
func (p *syncTestPool) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	if strings.Contains(sql, "document_snapshots") {
		p.generations = append(p.generations, args[1].(string))
		return syncRow(func(values ...any) error {
			if p.checkpoint == nil {
				return pgx.ErrNoRows
			}
			*values[0].(*[]byte) = p.checkpoint
			return nil
		})
	}
	return syncRow(func(values ...any) error { *values[0].(*string) = p.key; return nil })
}
func (p *syncTestPool) Query(_ context.Context, _ string, args ...any) (pgx.Rows, error) {
	p.generations = append(p.generations, args[1].(string))
	return &syncRows{data: p.updates}, nil
}
func (p *syncTestPool) Ping(context.Context) error { return nil }
func (p *syncTestPool) Close()                     {}
func (p *syncTestPool) Exec(_ context.Context, _ string, args ...any) (pgconn.CommandTag, error) {
	if p.rotateOnInsert {
		p.key = "new-generation"
	}
	if len(args) != 3 || args[2] != p.key {
		return pgconn.NewCommandTag("INSERT 0 0"), nil
	}
	p.inserts++
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}

type syncRows struct {
	pgx.Rows
	data [][]byte
	next int
}

func (r *syncRows) Next() bool { r.next++; return r.next <= len(r.data) }
func (r *syncRows) Scan(values ...any) error {
	*values[0].(*[]byte) = r.data[r.next-1]
	return nil
}
func (*syncRows) Close()     {}
func (*syncRows) Err() error { return nil }

type syncTestObjects struct {
	data []byte
	keys []string
	puts int
}

func (o *syncTestObjects) Get(_ context.Context, key string) ([]byte, error) {
	o.keys = append(o.keys, key)
	return o.data, nil
}
func (o *syncTestObjects) Put(context.Context, string, []byte) error { o.puts++; return nil }
func (o *syncTestObjects) Delete(context.Context, string) error      { return nil }
func (o *syncTestObjects) PresignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}
func syncEnvelope(base []byte) []byte {
	data, _ := json.Marshal(map[string]any{"protocol": "gotipe.crdt/1", "base": json.RawMessage(base), "operations": []any{}})
	return data
}
func TestSyncPersistenceNeverOverwritesOrDownloadsDocumentContent(t *testing.T) {
	base := []byte(`{"blocks":[],"version":0}`)
	pool := &syncTestPool{key: "generation-one"}
	objects := &syncTestObjects{data: base}
	store := &dbPersistenceStore{db: &storage.PostgresStore{Pool: pool}, r2: objects}
	if err := store.SaveUpdate(context.Background(), "doc", "generation-one", syncEnvelope(base)); err != nil {
		t.Fatal(err)
	}
	if pool.inserts != 1 || objects.puts != 0 {
		t.Fatal("collaboration changed the ordinary document object")
	}
	if len(objects.keys) != 0 {
		t.Fatalf("a save downloaded the document object: %v", objects.keys)
	}
}
func TestSyncPersistenceReportsReplacedBaselineAndPointerRace(t *testing.T) {
	base := []byte(`{"blocks":[],"version":0}`)
	pool := &syncTestPool{key: "generation-two"}
	objects := &syncTestObjects{data: base}
	store := &dbPersistenceStore{db: &storage.PostgresStore{Pool: pool}, r2: objects}
	if err := store.SaveUpdate(context.Background(), "doc", "generation-one", syncEnvelope(base)); !errors.Is(err, cloudsync.ErrBaselineReplaced) {
		t.Fatalf("stale generation was not reported as replaced: %v", err)
	}
	if pool.inserts != 0 {
		t.Fatal("stale log was persisted")
	}
	pool.key, pool.rotateOnInsert = "generation-one", true
	if err := store.SaveUpdate(context.Background(), "doc", "generation-one", syncEnvelope(base)); !errors.Is(err, cloudsync.ErrBaselineReplaced) {
		t.Fatalf("pointer change during save was not reported as replaced: %v", err)
	}
	if pool.inserts != 0 || objects.puts != 0 {
		t.Fatal("generation race changed storage")
	}
}
func TestSyncPersistenceLoadsOneGeneration(t *testing.T) {
	base := []byte(`{"blocks":[],"version":0}`)
	pool := &syncTestPool{key: "generation-two", checkpoint: []byte("checkpoint"), updates: [][]byte{[]byte("one"), []byte("two")}}
	objects := &syncTestObjects{data: base}
	store := &dbPersistenceStore{db: &storage.PostgresStore{Pool: pool}, r2: objects}
	state, err := store.LoadState(context.Background(), "doc")
	if err != nil {
		t.Fatal(err)
	}
	if state.Generation != "generation-two" || string(state.Document) != string(base) || len(state.Updates) != 3 || string(state.Updates[0]) != "checkpoint" || string(state.Updates[2]) != "two" {
		t.Fatalf("unexpected state: %+v", state)
	}
	if len(objects.keys) != 1 || objects.keys[0] != "generation-two" {
		t.Fatalf("document read from another generation: %v", objects.keys)
	}
	for _, generation := range pool.generations {
		if generation != "generation-two" {
			t.Fatalf("log filtered by another generation: %v", pool.generations)
		}
	}
}
