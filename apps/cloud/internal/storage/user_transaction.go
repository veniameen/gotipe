package storage

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// WithUserLock serializes quota decisions across API processes. The count query
// runs after acquiring the lock in a new READ COMMITTED statement snapshot.
// Keep network calls outside this short transaction.
func WithUserLock(ctx context.Context, pool ConnectionPool, userID string, operation func(Database) error) error {
	return WithAdvisoryTransaction(ctx, pool, "quota:"+userID, operation)
}

// WithAdvisoryTransaction serializes a bounded operation across server processes.
// Callers must supply a deadline. Different domains use separate key prefixes.
func WithAdvisoryTransaction(ctx context.Context, db Database, key string, operation func(Database) error) error {
	beginner, ok := db.(interface {
		BeginTx(context.Context, pgx.TxOptions) (pgx.Tx, error)
	})
	if !ok {
		return errors.New("database does not support atomic quota transactions")
	}
	tx, err := beginner.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		_ = tx.Rollback(cleanup)
	}()
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 704912))`, key); err != nil {
		return err
	}
	if err = operation(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
