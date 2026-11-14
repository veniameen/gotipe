package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/gotipe/cloud/internal/storage"
	cloudsync "github.com/gotipe/cloud/internal/sync"
	"github.com/jackc/pgx/v5"
)

const (
	// A log is compacted once it has this many rows…
	defaultCompactRows = 256
	// …or this many bytes outside its largest row, which is usually the result
	// of the previous compaction: merging it again alone would save nothing.
	defaultCompactBytes = 4 << 20
	// concurrentCompactions bounds the merges one process runs at once: each
	// holds a document's whole log in memory, and many rooms can empty together.
	concurrentCompactions = 2
)

// compactionSlots is the per-process semaphore of concurrentCompactions.
var compactionSlots = make(chan struct{}, concurrentCompactions)

type transactional interface {
	BeginTx(context.Context, pgx.TxOptions) (pgx.Tx, error)
}

// CompactLog replaces the stored rows of a generation by one row holding the
// union of their operations.
//
// The rows are read and merged without a lock, so a long merge never delays a
// save. One short transaction then locks the document row against writers that
// change it (FOR NO KEY UPDATE: saves and a REST replacement wait, inserts that
// only reference the document, such as comments, do not), requires the
// generation to be current, deletes exactly the rows that were read and inserts
// their union. If any of those rows is gone, another compaction or a
// replacement got there first and nothing is written. A row committed after
// the read was not merged and is not deleted, so it now precedes the merged row
// it may depend on: readers apply all rows as one union, never one by one, and
// see the same operations before, during and after. At most
// concurrentCompactions merges run in one process; a waiting one gives up when
// ctx ends.
func (p *dbPersistenceStore) CompactLog(ctx context.Context, documentID, generation string) error {
	var rows, size, largest, checkpoints int64
	if err := p.db.Pool.QueryRow(ctx, `SELECT count(*), COALESCE(sum(octet_length(data)),0), COALESCE(max(octet_length(data)),0),
	 (SELECT count(*) FROM document_snapshots WHERE document_id=$1 AND generation_key=$2)
	 FROM document_updates WHERE document_id=$1 AND generation_key=$2`, documentID, generation).Scan(&rows, &size, &largest, &checkpoints); err != nil {
		return err
	}
	if !p.logHasGrown(rows, size-largest, checkpoints) {
		return nil
	}
	pool, ok := p.db.Pool.(transactional)
	if !ok {
		return errors.New("database does not support log compaction transactions")
	}
	select {
	case compactionSlots <- struct{}{}:
		defer func() { <-compactionSlots }()
	case <-ctx.Done():
		return ctx.Err() // Storage is unchanged; the room retries later.
	}
	merger := cloudsync.NewLogMerger()
	var checkpointID int64
	var checkpoint []byte
	err := p.db.Pool.QueryRow(ctx, `SELECT id, data FROM document_snapshots WHERE document_id=$1 AND generation_key=$2 ORDER BY id DESC LIMIT 1`, documentID, generation).Scan(&checkpointID, &checkpoint)
	if err == nil {
		err = merger.Add(checkpoint)
	} else if errors.Is(err, pgx.ErrNoRows) {
		err = nil
	}
	if err != nil {
		return err
	}
	merged, err := mergeRows(ctx, p.db.Pool, merger, documentID, generation)
	if err != nil {
		return err
	}

	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		_ = tx.Rollback(cleanup)
	}()
	var current string
	if err := tx.QueryRow(ctx, `SELECT r2_key FROM documents WHERE id=$1 FOR NO KEY UPDATE`, documentID).Scan(&current); err != nil {
		return err
	}
	if current != generation {
		return fmt.Errorf("%w: the document generation changed before the log was compacted", cloudsync.ErrBaselineReplaced)
	}
	removed, err := tx.Exec(ctx, `DELETE FROM document_updates WHERE id = ANY($1)`, merged)
	if err != nil {
		return err
	}
	if removed.RowsAffected() != int64(len(merged)) {
		return nil // Another compaction merged these rows; the rollback keeps the rest.
	}
	if _, err := tx.Exec(ctx, `INSERT INTO document_updates (document_id,data,created_at,generation_key) VALUES ($1,$2,now(),$3)`, documentID, merger.Bytes(), generation); err != nil {
		return err
	}
	// Checkpoints up to the one merged are covered by the new row.
	if _, err := tx.Exec(ctx, `DELETE FROM document_snapshots WHERE document_id=$1 AND generation_key=$2 AND id <= $3`, documentID, generation, checkpointID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// mergeRows adds every committed row of the generation and returns their IDs.
func mergeRows(ctx context.Context, db storage.Database, merger *cloudsync.LogMerger, documentID, generation string) ([]int64, error) {
	rows, err := db.Query(ctx, `SELECT id, data FROM document_updates WHERE document_id=$1 AND generation_key=$2 ORDER BY id`, documentID, generation)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		var data []byte
		if err := rows.Scan(&id, &data); err != nil {
			return nil, err
		}
		if err := merger.Add(data); err != nil {
			return nil, fmt.Errorf("stored collaboration update %d: %w", id, err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (p *dbPersistenceStore) logHasGrown(rows, bytesBesidesLargest, checkpoints int64) bool {
	maxRows, maxBytes := p.compactRows, p.compactBytes
	if maxRows <= 0 {
		maxRows = defaultCompactRows
	}
	if maxBytes <= 0 {
		maxBytes = defaultCompactBytes
	}
	if checkpoints > 0 {
		return true // Written before compaction: merged once, then never read again.
	}
	return rows > 1 && (rows >= maxRows || bytesBesidesLargest >= maxBytes)
}
