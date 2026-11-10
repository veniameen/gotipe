//go:build integration

package worker

import (
	"context"
	"errors"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/gotipe/cloud/internal/testdb"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type exportObjects struct {
	storage.ObjectStore
	mu      sync.Mutex
	objects map[string][]byte
}

func (s *exportObjects) Put(_ context.Context, key string, data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.objects[key] = append([]byte(nil), data...)
	return nil
}

type exportContents func(context.Context, string, string) ([]byte, error)

func (f exportContents) Load(ctx context.Context, id, key string) ([]byte, error) {
	return f(ctx, id, key)
}

type exportConverter func(context.Context, string, []byte) ([]byte, error)

func (f exportConverter) Convert(ctx context.Context, format string, data []byte) ([]byte, error) {
	return f(ctx, format, data)
}

func TestExportClaimsAreExclusiveAndConversionFailuresRemainFailed(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	var userID, docID, jobID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email)VALUES('export@test.invalid')RETURNING id`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO documents(owner_id,r2_key)VALUES($1,'baseline')RETURNING id`, userID).Scan(&docID); err != nil {
		t.Fatal(err)
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO export_jobs(user_id,document_id,format)VALUES($1,$2,'html')RETURNING id`, userID, docID).Scan(&jobID); err != nil {
		t.Fatal(err)
	}
	var conversions atomic.Int32
	objects := &exportObjects{objects: map[string][]byte{}}
	w := NewExportWorker(db, objects, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Second, "exports/", exportConverter(func(_ context.Context, format string, data []byte) ([]byte, error) {
		conversions.Add(1)
		if format != "html" || string(data) != "latest projected content" {
			t.Fatal("exported baseline or wrong format")
		}
		return []byte("<p>latest projected content</p>"), nil
	}), exportContents(func(context.Context, string, string) ([]byte, error) { return []byte("latest projected content"), nil }), ExportOptions{Workers: 2})
	var workers sync.WaitGroup
	for i := 0; i < 2; i++ {
		workers.Add(1)
		go func() { defer workers.Done(); w.processJobs(ctx) }()
	}
	workers.Wait()
	var status string
	var attempts int
	if err := db.Pool.QueryRow(ctx, `SELECT status,attempts FROM export_jobs WHERE id=$1`, jobID).Scan(&status, &attempts); err != nil {
		t.Fatal(err)
	}
	if status != "completed" || attempts != 1 || conversions.Load() != 1 || len(objects.objects) != 1 {
		t.Fatalf("status=%s attempts=%d conversions=%d outputs=%d", status, attempts, conversions.Load(), len(objects.objects))
	}
	if err := db.Pool.QueryRow(ctx, `INSERT INTO export_jobs(user_id,document_id,format)VALUES($1,$2,'pdf')RETURNING id`, userID, docID).Scan(&jobID); err != nil {
		t.Fatal(err)
	}
	w.converter = exportConverter(func(context.Context, string, []byte) ([]byte, error) { return nil, errors.New("unsupported content") })
	w.processJobs(ctx)
	if err := db.Pool.QueryRow(ctx, `SELECT status FROM export_jobs WHERE id=$1`, jobID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "failed" || len(objects.objects) != 1 {
		t.Fatalf("counterfeit successful export: %s", status)
	}
}
