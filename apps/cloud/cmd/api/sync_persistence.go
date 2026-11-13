package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/gotipe/cloud/internal/storage"
	cloudsync "github.com/gotipe/cloud/internal/sync"
	"github.com/jackc/pgx/v5"
)

// Collaboration checkpoints never replace the document's ordinary JSON object.
// Updates are retained so checkpoints cannot hide an update from another writer.
// A generation is the immutable object key in documents.r2_key: REST replacement
// writes a new object, so a write pinned to the room's key can never enter the
// log of another baseline.
type dbPersistenceStore struct {
	db *storage.PostgresStore
	r2 storage.ObjectStore
}

func (p *dbPersistenceStore) LoadState(ctx context.Context, documentID string) (cloudsync.StoredState, error) {
	var state cloudsync.StoredState
	if err := p.db.Pool.QueryRow(ctx, `SELECT r2_key FROM documents WHERE id = $1`, documentID).Scan(&state.Generation); err != nil {
		return cloudsync.StoredState{}, err
	}
	document, err := p.r2.Get(ctx, state.Generation)
	if err != nil {
		return cloudsync.StoredState{}, err
	}
	state.Document = document
	state.Updates = make([][]byte, 0)
	var checkpoint []byte
	err = p.db.Pool.QueryRow(ctx, `SELECT data FROM document_snapshots WHERE document_id = $1 AND generation_key = $2 ORDER BY id DESC LIMIT 1`, documentID, state.Generation).Scan(&checkpoint)
	if err == nil {
		state.Updates = append(state.Updates, checkpoint)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return cloudsync.StoredState{}, err
	}
	rows, err := p.db.Pool.Query(ctx, `SELECT data FROM document_updates WHERE document_id = $1 AND generation_key = $2 ORDER BY id`, documentID, state.Generation)
	if err != nil {
		return cloudsync.StoredState{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var update []byte
		if err := rows.Scan(&update); err != nil {
			return cloudsync.StoredState{}, err
		}
		state.Updates = append(state.Updates, update)
	}
	if err := rows.Err(); err != nil {
		return cloudsync.StoredState{}, err
	}
	return state, nil
}
func (p *dbPersistenceStore) CurrentGeneration(ctx context.Context, documentID string) (string, error) {
	var generation string
	err := p.db.Pool.QueryRow(ctx, `SELECT r2_key FROM documents WHERE id = $1`, documentID).Scan(&generation)
	return generation, err
}

// SaveUpdate locks and advances the document row first and inserts only from
// the row it changed. A REST replacement holding the row makes the UPDATE match
// nothing once it commits, so no delta of the old generation is inserted.
func (p *dbPersistenceStore) SaveUpdate(ctx context.Context, documentID, generation string, update []byte) error {
	tag, err := p.db.Pool.Exec(ctx, `WITH changed AS (
	 UPDATE documents SET updated_at=now(),version=version+1 WHERE id=$1 AND r2_key=$3 RETURNING id,r2_key
	) INSERT INTO document_updates (document_id,data,created_at,generation_key)
	 SELECT id,$2,now(),r2_key FROM changed`, documentID, update, generation)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return fmt.Errorf("%w: the document generation changed before the update was saved", cloudsync.ErrBaselineReplaced)
	}
	return nil
}
func (p *dbPersistenceStore) SaveSnapshot(ctx context.Context, documentID, generation string, snapshot []byte) error {
	tag, err := p.db.Pool.Exec(ctx, `INSERT INTO document_snapshots (document_id, data, version, created_at, generation_key) SELECT d.id, $2, COALESCE((SELECT MAX(id) FROM document_updates WHERE document_id = d.id AND generation_key = d.r2_key), 0), now(), d.r2_key FROM documents d WHERE d.id = $1 AND d.r2_key = $3`, documentID, snapshot, generation)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return fmt.Errorf("%w: the document generation changed before the checkpoint was saved", cloudsync.ErrBaselineReplaced)
	}
	return nil
}
