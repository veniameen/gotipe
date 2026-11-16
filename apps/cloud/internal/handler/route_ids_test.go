package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Every route ID that is not a canonical UUID answers 400 before the database:
// PostgreSQL would turn it into a 500, or a lookup into a misleading 404.
func TestRouteIDsThatAreNotUUIDsAnswer400BeforeTheDatabase(t *testing.T) {
	pool := &testPool{
		row: func(sql string, _ ...any) pgx.Row {
			t.Fatalf("database reached: %s", sql)
			return nil
		},
		query: func(sql string, _ ...any) (pgx.Rows, error) {
			t.Fatalf("database reached: %s", sql)
			return nil, nil
		},
		exec: func(sql string, _ ...any) (pgconn.CommandTag, error) {
			t.Fatalf("database reached: %s", sql)
			return pgconn.CommandTag{}, nil
		},
	}
	db := &storage.PostgresStore{Pool: pool}
	logger := audit.NewAuditLogger(pool)
	comments := NewCommentsHandler(db, logger)
	versions := NewVersionsHandler(db, nil, logger, nil)
	permissions := NewPermissionsHandler(db, logger)
	orgs := NewOrganizationsHandler(db, logger)
	exports := NewExportsHandler(db, nil, logger)
	documents := NewDocumentsHandler(db, nil, logger, nil)
	routes := []struct {
		name, method, param, body string
		handler                   http.HandlerFunc
	}{
		{"reply", "POST", "commentId", `{"content":"hi"}`, comments.ReplyToComment()},
		{"resolve", "POST", "commentId", "", comments.ResolveComment()},
		{"delete comment", "DELETE", "commentId", "", comments.DeleteComment()},
		{"restore", "POST", "versionId", "", versions.RestoreVersion()},
		{"revoke", "DELETE", "userId", "", permissions.RevokePermission()},
		{"organization", "GET", "id", "", orgs.GetOrganization()},
		{"members", "GET", "id", "", orgs.ListMembers()},
		{"add member", "POST", "id", `{"email":"a@test.invalid","role":"viewer"}`, orgs.AddMember()},
		{"remove member", "DELETE", "id", "", orgs.RemoveMember()},
		{"remove member user", "DELETE", "userId", "", orgs.RemoveMember()},
		{"export", "GET", "id", "", exports.GetExport()},
		{"document", "GET", "id", "", documents.GetDocument()},
		{"update document", "PATCH", "id", `{"title":"x"}`, documents.UpdateDocument()},
	}
	user := &auth.UserContext{UserID: testUserID, Plan: "free", Scopes: []string{"admin"}}
	for _, route := range routes {
		for _, id := range []string{"not-a-uuid", "{" + testCommentID + "}", "urn:uuid:" + testCommentID, strings.ReplaceAll(testCommentID, "-", "")} {
			r := requestAs(route.method, "/", route.body, user)
			chi.RouteContext(r.Context()).URLParams.Add(route.param, id)
			w := httptest.NewRecorder()
			route.handler(w, r)
			if w.Code != 400 || !strings.Contains(w.Body.String(), "VALIDATION_ERROR") {
				t.Fatalf("%s with %s=%s: %d %s", route.name, route.param, id, w.Code, w.Body)
			}
		}
	}
	for _, id := range []string{"{" + testDocumentID + "}", "urn:uuid:" + testDocumentID, strings.ReplaceAll(testDocumentID, "-", "")} {
		w := httptest.NewRecorder()
		documents.CreateDocument()(w, requestAs("POST", "/v1/documents", `{"id":"`+id+`","title":"x"}`, user))
		if w.Code != 400 {
			t.Fatalf("create with id %s: %d %s", id, w.Code, w.Body)
		}
	}
}

func TestDocumentAndCommentBodiesAreValidatedBeforeTheDatabase(t *testing.T) {
	writes := 0
	pool := &testPool{
		row: func(sql string, _ ...any) pgx.Row {
			return testRow(func(dest ...any) error {
				if strings.Contains(sql, "SELECT CASE WHEN d.owner_id") {
					*dest[0].(*string) = "owner"
					return nil
				}
				if strings.Contains(sql, "SELECT r2_key FROM documents") {
					*dest[0].(*string) = "documents/key"
					return nil
				}
				return pgx.ErrNoRows
			})
		},
		exec: func(sql string, _ ...any) (pgconn.CommandTag, error) {
			writes++
			return pgconn.NewCommandTag("INSERT 0 1"), nil
		},
	}
	db := &storage.PostgresStore{Pool: pool}
	user := &auth.UserContext{UserID: testUserID, Plan: "free", Scopes: []string{"admin"}}
	w := httptest.NewRecorder()
	NewDocumentsHandler(db, nil, audit.NewAuditLogger(pool), nil).UpdateDocument()(w, requestAs("PATCH", "/", `{"content":null}`, user))
	if w.Code != 400 {
		t.Fatalf("PATCH with null content: %d %s", w.Code, w.Body)
	}
	w = httptest.NewRecorder()
	NewCommentsHandler(db, audit.NewAuditLogger(pool)).CreateComment()(w, requestAs("POST", "/", `{"content":"x","anchor_type":"inline","block_id":"b","from":0,"to":2147483648}`, user))
	if w.Code != 400 {
		t.Fatalf("offset above INTEGER: %d %s", w.Code, w.Body)
	}
	if writes != 0 {
		t.Fatalf("%d writes before validation", writes)
	}
}
