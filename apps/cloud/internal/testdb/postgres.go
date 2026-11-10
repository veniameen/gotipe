//go:build integration

// Package testdb creates an isolated disposable database for integration tests.
package testdb

import (
	"context"
	"github.com/google/uuid"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/gotipe/cloud/migrations"
	"github.com/jackc/pgx/v5"
	"net/url"
	"os"
	"strings"
	"testing"
)

func Open(t *testing.T) *storage.PostgresStore {
	t.Helper()
	connectionURL := os.Getenv("GOTIPE_TEST_DATABASE_URL")
	if connectionURL == "" {
		t.Fatal("integration tests require GOTIPE_TEST_DATABASE_URL with CREATE DATABASE permission")
	}
	ctx := context.Background()
	admin, err := pgx.Connect(ctx, connectionURL)
	if err != nil {
		t.Fatal(err)
	}
	name := "gotipe_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err = admin.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize()); err != nil {
		admin.Close(ctx)
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(ctx, "DROP DATABASE "+pgx.Identifier{name}.Sanitize()+" WITH (FORCE)"); err != nil {
			t.Error(err)
		}
		admin.Close(ctx)
	})
	parsed, err := url.Parse(connectionURL)
	if err != nil {
		t.Fatal(err)
	}
	parsed.Path = "/" + name
	if err = migrations.Up(ctx, parsed.String()); err != nil {
		t.Fatal(err)
	}
	// Idempotent migration replay must not reapply schema changes.
	if err = migrations.Up(ctx, parsed.String()); err != nil {
		t.Fatal(err)
	}
	db, err := storage.NewPostgresStore(ctx, parsed.String(), 4, 0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	return db
}
