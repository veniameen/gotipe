package handler

import (
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

func patchPool(t *testing.T, failWrite bool) *testPool {
	t.Helper()
	pool := &testPool{}
	pool.row = func(sql string, args ...any) pgx.Row {
		return testRow(func(dest ...any) error {
			switch {
			case strings.Contains(sql, "LEFT JOIN document_permissions"):
				*dest[0].(*string) = "editor"
			case strings.Contains(sql, "SELECT r2_key"):
				*dest[0].(*string) = "current"
			default:
				*dest[0].(*string) = "document"
				*dest[1].(*string) = "title"
				*dest[2].(*int64) = 2
				*dest[3].(*int64) = 1
				*dest[4].(*time.Time) = time.Now()
				*dest[5].(*time.Time) = time.Now()
			}
			return nil
		})
	}
	pool.exec = func(sql string, args ...any) (pgconn.CommandTag, error) {
		if failWrite && strings.Contains(sql, "UPDATE documents") {
			return pgconn.CommandTag{}, errors.New("database unavailable")
		}
		return pgconn.NewCommandTag("UPDATE 1"), nil
	}
	return pool
}

func TestContentReplacementNotifiesCollaborationAfterCommit(t *testing.T) {
	for _, tc := range []struct {
		name      string
		body      string
		failWrite bool
		status    int
		notified  []string
	}{
		{"content", `{"content":{"blocks":[]}}`, false, 200, []string{testDocumentID}},
		{"title only", `{"title":"renamed"}`, false, 200, nil},
		{"failed write", `{"content":{"blocks":[]}}`, true, 500, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool := patchPool(t, tc.failWrite)
			objects := &memoryObjects{data: map[string][]byte{"current": []byte(`{"blocks":[]}`)}}
			h := NewDocumentsHandler(&storage.PostgresStore{Pool: pool}, objects, audit.NewAuditLogger(pool))
			var notified []string
			h.SetBaselineReplacement(func(documentID string) { notified = append(notified, documentID) })
			w := httptest.NewRecorder()
			h.UpdateDocument()(w, requestAs("PATCH", "/", tc.body, &auth.UserContext{UserID: "editor"}))
			if w.Code != tc.status || strings.Join(notified, ",") != strings.Join(tc.notified, ",") {
				t.Fatalf("got %d, notified %v: %s", w.Code, notified, w.Body)
			}
		})
	}
}

func TestVersionRestoreNotifiesCollaborationOnlyWhenCommitted(t *testing.T) {
	for _, committed := range []bool{true, false} {
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
			if strings.Contains(sql, "WITH restored") && !committed {
				return pgconn.NewCommandTag("INSERT 0 0"), nil
			}
			return pgconn.NewCommandTag("INSERT 0 1"), nil
		}
		h := NewVersionsHandler(&storage.PostgresStore{Pool: pool}, objects, audit.NewAuditLogger(pool))
		notified := 0
		h.SetBaselineReplacement(func(documentID string) {
			if documentID != testDocumentID {
				t.Fatalf("notified %s", documentID)
			}
			notified++
		})
		w := httptest.NewRecorder()
		h.RestoreVersion()(w, requestAs("POST", "/", "", &auth.UserContext{UserID: "editor"}))
		want := map[bool]int{true: 1, false: 0}[committed]
		if notified != want {
			t.Fatalf("committed=%v: %d notices, status %d", committed, notified, w.Code)
		}
	}
}

func TestDeleteAnswersNotFoundToEveryoneButTheOwner(t *testing.T) {
	for _, tc := range []struct {
		role   string
		err    error
		status int
	}{
		{"", nil, 404}, {"viewer", nil, 404}, {"editor", nil, 404}, {"admin", nil, 404},
		{"missing", pgx.ErrNoRows, 404}, {"unavailable", errors.New("offline"), 500},
		{"owner", nil, 204},
	} {
		t.Run(tc.role, func(t *testing.T) {
			deleted := false
			pool := &testPool{row: func(sql string, args ...any) pgx.Row {
				if args[0] != testDocumentID {
					t.Fatalf("looked up another document: %v", args)
				}
				return testRow(func(dest ...any) error {
					if tc.err != nil {
						return tc.err
					}
					if strings.Contains(sql, "LEFT JOIN document_permissions") {
						if args[1] != "caller" {
							t.Fatalf("role checked for another user: %v", args)
						}
						*dest[0].(*string) = tc.role
					} else {
						*dest[0].(*string) = "current"
					}
					return nil
				})
			}, exec: func(sql string, _ ...any) (pgconn.CommandTag, error) {
				if strings.Contains(sql, "DELETE FROM documents") {
					deleted = true
				}
				return pgconn.NewCommandTag("DELETE 1"), nil
			}}
			objects := &memoryObjects{data: map[string][]byte{"current": []byte("content")}}
			w := httptest.NewRecorder()
			NewDocumentsHandler(&storage.PostgresStore{Pool: pool}, objects, audit.NewAuditLogger(pool)).DeleteDocument()(w, requestAs("DELETE", "/", "", &auth.UserContext{UserID: "caller"}))
			removed := objects.data["current"] == nil
			if w.Code != tc.status || deleted != (tc.status == 204) || removed != (tc.status == 204) {
				t.Fatalf("got %d, deleted=%v, object removed=%v: %s", w.Code, deleted, removed, w.Body)
			}
		})
	}
}
