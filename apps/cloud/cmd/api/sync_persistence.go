package main

import (
	"context"
	"errors"

	"github.com/gotipe/cloud/internal/storage"
	cloudsync "github.com/gotipe/cloud/internal/sync"
	"github.com/jackc/pgx/v5"
)

// Collaboration checkpoints never replace the document's ordinary JSON object.
// Updates are retained so checkpoints cannot hide an update from another writer.
type dbPersistenceStore struct {
	db *storage.PostgresStore
	r2 storage.ObjectStore
}

func (p *dbPersistenceStore) LoadDocument(ctx context.Context, documentID string) ([]byte, error) {
	var key string
	if err := p.db.Pool.QueryRow(ctx, `SELECT r2_key FROM documents WHERE id = $1`, documentID).Scan(&key); err != nil {
		return nil, err
	}
	return p.r2.Get(ctx, key)
}
func (p *dbPersistenceStore) LoadUpdates(ctx context.Context, documentID string) ([][]byte, error) {
	updates := make([][]byte, 0)
	var generation string
	if err := p.db.Pool.QueryRow(ctx, `SELECT r2_key FROM documents WHERE id = $1`, documentID).Scan(&generation); err != nil {
		return nil, err
	}
	var checkpoint []byte
	err := p.db.Pool.QueryRow(ctx, `SELECT data FROM document_snapshots WHERE document_id = $1 AND generation_key = $2 ORDER BY id DESC LIMIT 1`, documentID, generation).Scan(&checkpoint)
	if err == nil {
		updates = append(updates, checkpoint)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	rows, err := p.db.Pool.Query(ctx, `SELECT data FROM document_updates WHERE document_id = $1 AND generation_key = $2 ORDER BY id`, documentID, generation)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var update []byte
		if err := rows.Scan(&update); err != nil {
			return nil, err
		}
		updates = append(updates, update)
	}
	return updates, rows.Err()
}
func (p *dbPersistenceStore) baselineKey(ctx context.Context, documentID string, update []byte) (string, error) {
	var key string
	if err := p.db.Pool.QueryRow(ctx, `SELECT r2_key FROM documents WHERE id = $1`, documentID).Scan(&key); err != nil {
		return "", err
	}
	document, err := p.r2.Get(ctx, key)
	if err != nil {
		return "", err
	}
	if err := cloudsync.ValidateBaseline(document, update); err != nil {
		return "", err
	}
	return key, nil
}
func (p *dbPersistenceStore) SaveUpdate(ctx context.Context, documentID string, update []byte) error {
	key, err := p.baselineKey(ctx, documentID, update)
	if err != nil {
		return err
	}
	tag, err := p.db.Pool.Exec(ctx, `WITH saved AS (
	 INSERT INTO document_updates (document_id,data,created_at,generation_key)
	 SELECT id,$2,now(),r2_key FROM documents WHERE id=$1 AND r2_key=$3 RETURNING document_id
	) UPDATE documents d SET updated_at=now(),version=d.version+1
	 WHERE d.id=$1 AND d.r2_key=$3 AND EXISTS(SELECT 1 FROM saved WHERE document_id=d.id)`, documentID, update, key)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return errors.New("document generation changed while saving collaboration update")
	}
	return nil
}
func (p *dbPersistenceStore) SaveSnapshot(ctx context.Context, documentID string, snapshot []byte) error {
	key, err := p.baselineKey(ctx, documentID, snapshot)
	if err != nil {
		return err
	}
	tag, err := p.db.Pool.Exec(ctx, `INSERT INTO document_snapshots (document_id, data, version, created_at, generation_key) SELECT d.id, $2, COALESCE((SELECT MAX(id) FROM document_updates WHERE document_id = d.id AND generation_key = d.r2_key), 0), now(), d.r2_key FROM documents d WHERE d.id = $1 AND d.r2_key = $3`, documentID, snapshot, key)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return errors.New("document generation changed while checkpointing collaboration")
	}
	return nil
}
