package storage

import (
	"context"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Database is the query boundary shared by handlers and background services.
// Keeping it independent of a live pool allows deterministic authorization tests.
type Database interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

type ConnectionPool interface {
	Database
	Ping(context.Context) error
	Close()
}
