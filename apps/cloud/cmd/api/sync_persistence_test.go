package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type syncTestPool struct {
	key            string
	rotateOnInsert bool
	inserts        int
}
type keyRow struct{ key string }

func (r keyRow) Scan(values ...any) error                                { *values[0].(*string) = r.key; return nil }
func (p *syncTestPool) QueryRow(context.Context, string, ...any) pgx.Row { return keyRow{p.key} }
func (p *syncTestPool) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("unexpected query")
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

type syncTestObjects struct {
	data []byte
	puts int
}

func (o *syncTestObjects) Get(context.Context, string) ([]byte, error) { return o.data, nil }
func (o *syncTestObjects) Put(context.Context, string, []byte) error   { o.puts++; return nil }
func (o *syncTestObjects) Delete(context.Context, string) error        { return nil }
func (o *syncTestObjects) PresignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}
func syncEnvelope(base []byte) []byte {
	data, _ := json.Marshal(map[string]any{"protocol": "gotipe.crdt/1", "base": json.RawMessage(base), "operations": []any{}})
	return data
}
func TestSyncPersistenceNeverOverwritesDocumentContent(t *testing.T) {
	base := []byte(`{"blocks":[],"version":0}`)
	pool := &syncTestPool{key: "generation-one"}
	objects := &syncTestObjects{data: base}
	store := &dbPersistenceStore{db: &storage.PostgresStore{Pool: pool}, r2: objects}
	if err := store.SaveUpdate(context.Background(), "doc", syncEnvelope(base)); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveSnapshot(context.Background(), "doc", syncEnvelope(base)); err != nil {
		t.Fatal(err)
	}
	if pool.inserts != 2 || objects.puts != 0 {
		t.Fatal("collaboration changed the ordinary document object")
	}
}
func TestSyncPersistenceRejectsChangedBaselineAndPointerRace(t *testing.T) {
	base := []byte(`{"blocks":[],"version":0}`)
	pool := &syncTestPool{key: "generation-one"}
	objects := &syncTestObjects{data: base}
	store := &dbPersistenceStore{db: &storage.PostgresStore{Pool: pool}, r2: objects}
	foreign := []byte(`{"blocks":[{"id":"new"}],"version":1}`)
	if err := store.SaveUpdate(context.Background(), "doc", syncEnvelope(foreign)); err == nil {
		t.Fatal("accepted stale baseline")
	}
	if pool.inserts != 0 {
		t.Fatal("stale log was persisted")
	}
	pool.rotateOnInsert = true
	if err := store.SaveUpdate(context.Background(), "doc", syncEnvelope(base)); err == nil {
		t.Fatal("accepted pointer change during save")
	}
	if pool.inserts != 0 || objects.puts != 0 {
		t.Fatal("generation race changed storage")
	}
}
