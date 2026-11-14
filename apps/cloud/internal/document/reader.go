// Package document materializes persisted collaboration operations through the
// native engine before content is read, versioned or exported.
package document

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/gotipe/cloud/internal/conversion"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
)

type ContentReader interface {
	Load(context.Context, string, string) ([]byte, error)
}

// CollaborationState is an opaque bootstrap sequence. Clients initialize a
// replica with Baseline, then apply every update before enabling local editing.
// Content alone is a materialized view and is not the replica's original base.
type CollaborationState struct {
	Baseline json.RawMessage   `json:"baseline"`
	Updates  []json.RawMessage `json:"updates"`
	// Generation names Baseline: a replica started from it connects to /sync
	// with this token and sends operations without repeating the baseline.
	Generation string `json:"generation"`
}

type Snapshot struct {
	Content            []byte
	CollaborationState *CollaborationState
}

type SnapshotReader interface {
	LoadSnapshot(context.Context, string, string) (Snapshot, error)
}

func LoadSnapshot(ctx context.Context, reader ContentReader, documentID, key string) (Snapshot, error) {
	if snapshots, ok := reader.(SnapshotReader); ok {
		return snapshots.LoadSnapshot(ctx, documentID, key)
	}
	content, err := reader.Load(ctx, documentID, key)
	return Snapshot{Content: content}, err
}

type ObjectReader struct{ Store storage.ObjectStore }

func (r ObjectReader) Load(ctx context.Context, _ string, key string) ([]byte, error) {
	return r.Store.Get(ctx, key)
}

type Reader struct {
	DB        storage.Database
	Store     storage.ObjectStore
	Converter conversion.Converter
}

func (r *Reader) Load(ctx context.Context, documentID, key string) ([]byte, error) {
	snapshot, err := r.LoadSnapshot(ctx, documentID, key)
	return snapshot.Content, err
}

func (r *Reader) LoadSnapshot(ctx context.Context, documentID, key string) (Snapshot, error) {
	baseline, err := r.Store.Get(ctx, key)
	if err != nil {
		return Snapshot{}, err
	}
	updates := []json.RawMessage{}
	totalBytes := len(baseline)
	var checkpoint []byte
	err = r.DB.QueryRow(ctx, `SELECT data FROM document_snapshots WHERE document_id=$1 AND generation_key=$2 ORDER BY id DESC LIMIT 1`, documentID, key).Scan(&checkpoint)
	if err == nil {
		updates = append(updates, json.RawMessage(checkpoint))
		totalBytes += len(checkpoint)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Snapshot{}, err
	}
	rows, err := r.DB.Query(ctx, `SELECT data FROM document_updates WHERE document_id=$1 AND generation_key=$2 ORDER BY id`, documentID, key)
	if err != nil {
		return Snapshot{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var data []byte
		if err := rows.Scan(&data); err != nil {
			return Snapshot{}, err
		}
		totalBytes += len(data)
		if totalBytes > MaterializationLimit {
			return Snapshot{}, errors.New("collaboration state exceeds materialization limit")
		}
		updates = append(updates, json.RawMessage(data))
	}
	if err := rows.Err(); err != nil {
		return Snapshot{}, err
	}
	var currentKey string
	if err := r.DB.QueryRow(ctx, `SELECT r2_key FROM documents WHERE id=$1`, documentID).Scan(&currentKey); err != nil {
		return Snapshot{}, err
	}
	if currentKey != key {
		return Snapshot{}, errors.New("document changed while loading content")
	}
	snapshot := Snapshot{Content: baseline, CollaborationState: &CollaborationState{Baseline: json.RawMessage(baseline), Updates: updates, Generation: GenerationToken(key)}}
	if len(updates) == 0 {
		return snapshot, nil
	}
	input, err := json.Marshal(struct {
		Document json.RawMessage   `json:"document"`
		Updates  []json.RawMessage `json:"updates"`
	}{json.RawMessage(baseline), updates})
	if err != nil {
		return Snapshot{}, err
	}
	snapshot.Content, err = r.Converter.Convert(ctx, "project-crdt", input)
	return snapshot, err
}
