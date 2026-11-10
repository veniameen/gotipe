package handler

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type memoryObjects struct {
	data   map[string][]byte
	writes []string
}

func (s *memoryObjects) Get(_ context.Context, key string) ([]byte, error) {
	value, ok := s.data[key]
	if !ok {
		return nil, errors.New("missing object")
	}
	return value, nil
}
func (s *memoryObjects) Put(_ context.Context, key string, data []byte) error {
	s.writes = append(s.writes, key)
	s.data[key] = append([]byte(nil), data...)
	return nil
}
func (s *memoryObjects) Delete(_ context.Context, key string) error { delete(s.data, key); return nil }
func (*memoryObjects) PresignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}

func TestDuplicateDocumentIDDoesNotOverwriteExistingContent(t *testing.T) {
	const id = "9d5f0a58-32be-4491-9cc6-0b1c54437e9b"
	originalKey := "documents/" + id + "/content.json"
	objects := &memoryObjects{data: map[string][]byte{originalKey: []byte("original")}}
	pool := &testPool{row: func(string, ...any) pgx.Row {
		return testRow(func(dest ...any) error { *dest[0].(*int64) = 0; return nil })
	}, exec: func(string, ...any) (pgconn.CommandTag, error) {
		return pgconn.CommandTag{}, &pgconn.PgError{Code: "23505"}
	}}
	h := NewDocumentsHandler(&storage.PostgresStore{Pool: pool}, objects, nil)
	w := httptest.NewRecorder()
	h.CreateDocument()(w, requestAs("POST", "/v1/documents", `{"id":"`+id+`","title":"attack","content":{"blocks":[]}}`, &auth.UserContext{UserID: "unrelated", Plan: "starter"}))
	if w.Code != 409 {
		t.Fatalf("got %d %s", w.Code, w.Body)
	}
	if string(objects.data[originalKey]) != "original" || len(objects.data) != 1 {
		t.Fatalf("duplicate creation changed original: %v", objects.data)
	}
	if len(objects.writes) != 1 || objects.writes[0] == originalKey {
		t.Fatalf("unsafe write: %v", objects.writes)
	}
}

func TestRenamePreservesSizeAndContent(t *testing.T) {
	pool := &testPool{}
	queries := 0
	pool.row = func(sql string, args ...any) pgx.Row {
		return testRow(func(dest ...any) error {
			queries++
			switch queries {
			case 1:
				*dest[0].(*string) = "editor"
			case 2:
				*dest[0].(*string) = "current"
			case 3:
				*dest[0].(*string) = "document"
				*dest[1].(*string) = "renamed"
				*dest[2].(*int64) = 2
				*dest[3].(*int64) = 99
				*dest[4].(*time.Time) = time.Now()
				*dest[5].(*time.Time) = time.Now()
			}
			return nil
		})
	}
	pool.exec = func(sql string, args ...any) (pgconn.CommandTag, error) {
		if strings.Contains(sql, "UPDATE documents") {
			if args[1].(*int64) != nil || args[2] != "current" {
				t.Fatalf("rename changed content/size: %v", args)
			}
		}
		return pgconn.NewCommandTag("UPDATE 1"), nil
	}
	objects := &memoryObjects{data: map[string][]byte{"current": []byte("untouched")}}
	w := httptest.NewRecorder()
	NewDocumentsHandler(&storage.PostgresStore{Pool: pool}, objects, audit.NewAuditLogger(pool)).UpdateDocument()(w, requestAs("PATCH", "/", `{"title":"renamed"}`, &auth.UserContext{UserID: "editor"}))
	if w.Code != 200 || len(objects.writes) != 0 || !strings.Contains(w.Body.String(), `"size_bytes":99`) {
		t.Fatalf("bad rename: %d %s", w.Code, w.Body)
	}
}

func TestRestorePreservesPreviousContentAndRollsBackStagedObjects(t *testing.T) {
	for _, succeed := range []bool{true, false} {
		t.Run(map[bool]string{true: "success", false: "concurrent edit"}[succeed], func(t *testing.T) {
			objects := &memoryObjects{data: map[string][]byte{"snapshot": []byte("old"), "current": []byte("current text")}}
			pool := &testPool{}
			pool.row = func(sql string, args ...any) pgx.Row {
				return testRow(func(dest ...any) error {
					switch {
					case strings.Contains(sql, "LEFT JOIN document_permissions"):
						*dest[0].(*string) = "editor"
					case strings.Contains(sql, "snapshot_key"):
						*dest[0].(*string) = "snapshot"
					default:
						*dest[0].(*string) = "current"
						*dest[1].(*int64) = 7
					}
					return nil
				})
			}
			pool.exec = func(sql string, args ...any) (pgconn.CommandTag, error) {
				if strings.Contains(sql, "WITH restored") {
					if args[3] != int64(7) || string(objects.data[args[0].(string)]) != "old" || string(objects.data[args[7].(string)]) != "current text" {
						t.Fatalf("restore did not stage both contents: %v", args)
					}
					if !succeed {
						return pgconn.NewCommandTag("INSERT 0 0"), nil
					}
				}
				return pgconn.NewCommandTag("INSERT 0 1"), nil
			}
			w := httptest.NewRecorder()
			NewVersionsHandler(&storage.PostgresStore{Pool: pool}, objects, audit.NewAuditLogger(pool)).RestoreVersion()(w, requestAs("POST", "/", "", &auth.UserContext{UserID: "editor"}))
			expected := 200
			if !succeed {
				expected = 409
				if len(objects.data) != 2 {
					t.Fatalf("staged data leaked: %v", objects.data)
				}
			}
			if w.Code != expected || string(objects.data["current"]) != "current text" || string(objects.data["snapshot"]) != "old" {
				t.Fatalf("unsafe restore: %d %s %v", w.Code, w.Body, objects.data)
			}
		})
	}
}

func TestDocumentByteLimitRejectsBeforeStorageOrQuota(t *testing.T) {
	objects := &memoryObjects{data: map[string][]byte{}}
	h := NewDocumentsHandler(&storage.PostgresStore{}, objects, nil)
	if err := h.SetDocumentLimit(16); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	h.CreateDocument()(response, requestAs("POST", "/", `{"title":"large","content":{"blocks":[],"extra":"too long"}}`, &auth.UserContext{UserID: "user"}))
	if response.Code != 413 || len(objects.writes) != 0 {
		t.Fatalf("large document accepted: %d %v", response.Code, objects.writes)
	}
}
