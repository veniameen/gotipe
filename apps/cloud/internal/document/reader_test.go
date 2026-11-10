package document

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
)

type row func(...any) error

func (r row) Scan(dest ...any) error { return r(dest...) }

type database struct {
	storage.Database
	checkpoint []byte
	updates    [][]byte
	key        string
	err        error
}

func (db database) QueryRow(_ context.Context, sql string, _ ...any) pgx.Row {
	return row(func(dest ...any) error {
		if strings.Contains(sql, "document_snapshots") {
			if db.checkpoint == nil {
				return pgx.ErrNoRows
			}
			*dest[0].(*[]byte) = db.checkpoint
		} else {
			*dest[0].(*string) = db.key
		}
		return nil
	})
}
func (db database) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return &rows{values: db.updates}, db.err
}

type rows struct {
	pgx.Rows
	values [][]byte
	index  int
}

func (r *rows) Next() bool             { return r.index < len(r.values) }
func (r *rows) Scan(dest ...any) error { *dest[0].(*[]byte) = r.values[r.index]; r.index++; return nil }
func (r *rows) Err() error             { return nil }
func (r *rows) Close()                 {}

type objects struct {
	storage.ObjectStore
	baseline []byte
}

func (s objects) Get(context.Context, string) ([]byte, error) { return s.baseline, nil }

type converter func(context.Context, string, []byte) ([]byte, error)

func (f converter) Convert(ctx context.Context, format string, data []byte) ([]byte, error) {
	return f(ctx, format, data)
}

func TestSnapshotKeepsReplicaBaselineSeparateFromMaterializedContent(t *testing.T) {
	base := []byte(`{"blocks":[],"version":1}`)
	checkpoint := []byte(`{"protocol":"gotipe.crdt/1","operations":["checkpoint"]}`)
	delta := []byte(`{"protocol":"gotipe.crdt/1","operations":["new edit"]}`)
	projected := []byte(`{"blocks":[{"id":"latest"}],"version":2}`)
	reader := &Reader{DB: database{checkpoint: checkpoint, updates: [][]byte{delta}, key: "base"}, Store: objects{baseline: base}, Converter: converter(func(_ context.Context, format string, input []byte) ([]byte, error) {
		if format != "project-crdt" {
			t.Fatalf("unexpected format %s", format)
		}
		var payload struct {
			Document json.RawMessage
			Updates  []json.RawMessage
		}
		if err := json.Unmarshal(input, &payload); err != nil {
			t.Fatal(err)
		}
		if string(payload.Document) != string(base) || len(payload.Updates) != 2 || string(payload.Updates[0]) != string(checkpoint) || string(payload.Updates[1]) != string(delta) {
			t.Fatalf("projection lost ordered updates: %s", input)
		}
		return projected, nil
	})}
	snapshot, err := reader.LoadSnapshot(context.Background(), "doc", "base")
	if err != nil {
		t.Fatal(err)
	}
	if string(snapshot.Content) != string(projected) || string(snapshot.CollaborationState.Baseline) != string(base) || len(snapshot.CollaborationState.Updates) != 2 {
		t.Fatalf("inconsistent bootstrap: %+v", snapshot)
	}
}

func TestSnapshotWithoutEditsDoesNotStartConverter(t *testing.T) {
	reader := &Reader{DB: database{key: "base"}, Store: objects{baseline: []byte(`{"blocks":[]}`)}, Converter: converter(func(context.Context, string, []byte) ([]byte, error) {
		t.Fatal("unexpected compiler process")
		return nil, nil
	})}
	snapshot, err := reader.LoadSnapshot(context.Background(), "doc", "base")
	if err != nil || snapshot.CollaborationState == nil || len(snapshot.CollaborationState.Updates) != 0 {
		t.Fatalf("snapshot=%+v err=%v", snapshot, err)
	}
}

func TestSnapshotRejectsChangedGenerationAndProjectionFailure(t *testing.T) {
	for _, changed := range []bool{true, false} {
		key := "base"
		if changed {
			key = "replaced"
		}
		reader := &Reader{DB: database{key: key, updates: [][]byte{[]byte(`{}`)}}, Store: objects{baseline: []byte(`{"blocks":[]}`)}, Converter: converter(func(context.Context, string, []byte) ([]byte, error) {
			if changed {
				t.Fatal("projected stale generation")
			}
			return nil, errors.New("invalid replica update")
		})}
		if _, err := reader.Load(context.Background(), "doc", "base"); err == nil {
			t.Fatal("expected failure, not baseline fallback")
		}
	}
}
