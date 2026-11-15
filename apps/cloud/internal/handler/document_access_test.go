package handler

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gotipe/cloud/internal/audit"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestChildResourcesRejectUnauthorizedAccessBeforeReadingOrWriting(t *testing.T) {
	for _, role := range []string{"", "viewer", "commenter", "editor", "admin", "owner"} {
		t.Run(role, func(t *testing.T) {
			pool := &testPool{row: func(sql string, args ...any) pgx.Row {
				if !strings.Contains(sql, "LEFT JOIN document_permissions") || args[0] != testDocumentID || args[1] != "caller" {
					t.Fatalf("resource accessed before authorization: %s %v", sql, args)
				}
				return testRow(func(dest ...any) error { *dest[0].(*string) = role; return nil })
			}}
			db := &storage.PostgresStore{Pool: pool}
			comments := NewCommentsHandler(db, nil)
			versions := NewVersionsHandler(db, nil, nil)
			perms := NewPermissionsHandler(db, nil)
			for _, tc := range []struct {
				name    string
				handle  http.HandlerFunc
				allowed bool
			}{
				{"comments", comments.ListComments(), role != ""},
				{"versions", versions.ListVersions(), role != ""},
				{"permissions", perms.ListPermissions(), role == "admin" || role == "owner"},
				{"set permission", perms.SetPermission(), role == "admin" || role == "owner"},
				{"revoke permission", perms.RevokePermission(), role == "owner"},
				{"reply", comments.ReplyToComment(), role != "" && role != "viewer"},
				{"resolve", comments.ResolveComment(), role != "" && role != "viewer"},
				{"restore", versions.RestoreVersion(), role == "editor" || role == "admin" || role == "owner"},
			} {
				if tc.allowed {
					continue
				}
				t.Run(tc.name, func(t *testing.T) {
					w := httptest.NewRecorder()
					tc.handle(w, requestAs("POST", "/", "{}", &auth.UserContext{UserID: "caller"}))
					if w.Code != 404 {
						t.Fatalf("got %d: %s", w.Code, w.Body)
					}
				})
			}
		})
	}
}

func TestAccessCheckFailsClosedOnDatabaseErrorAndMissingIdentity(t *testing.T) {
	for _, tc := range []struct {
		name   string
		user   *auth.UserContext
		err    error
		status int
	}{
		{"anonymous", nil, nil, 401}, {"missing", &auth.UserContext{UserID: "caller"}, pgx.ErrNoRows, 404}, {"database unavailable", &auth.UserContext{UserID: "caller"}, errors.New("offline"), 500},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool := &testPool{row: func(string, ...any) pgx.Row { return testRow(func(...any) error { return tc.err }) }}
			w := httptest.NewRecorder()
			requireDocumentAccess(w, requestAs("GET", "/", "", tc.user), pool, testDocumentID, "viewer")
			if w.Code != tc.status {
				t.Fatalf("got %d", w.Code)
			}
		})
	}
}

func TestAuthorizedChildReadsReturnEmptyLists(t *testing.T) {
	pool := &testPool{row: func(string, ...any) pgx.Row {
		return testRow(func(dest ...any) error { *dest[0].(*string) = "owner"; return nil })
	}, query: func(string, ...any) (pgx.Rows, error) { return &emptyRows{}, nil }}
	db := &storage.PostgresStore{Pool: pool}
	for _, tc := range []struct {
		handle http.HandlerFunc
		body   string
	}{
		{NewCommentsHandler(db, nil).ListComments(), `{"data":[],"has_more":false}`},
		{NewVersionsHandler(db, nil, nil).ListVersions(), `{"data":[],"has_more":false}`},
		{NewPermissionsHandler(db, nil).ListPermissions(), `{"data":[]}`},
	} {
		w := httptest.NewRecorder()
		tc.handle(w, requestAs("GET", "/", "", &auth.UserContext{UserID: "caller"}))
		if w.Code != 200 || strings.TrimSpace(w.Body.String()) != tc.body {
			t.Fatalf("bad list: %d %s", w.Code, w.Body)
		}
	}
}

func TestCommentResolutionWritesOnlyAfterRoleCheck(t *testing.T) {
	writes := 0
	pool := &testPool{row: func(string, ...any) pgx.Row {
		return testRow(func(dest ...any) error { *dest[0].(*string) = "commenter"; return nil })
	}, exec: func(sql string, args ...any) (pgconn.CommandTag, error) {
		writes++
		if strings.Contains(sql, "UPDATE comments") && (args[0] != "caller" || args[2] != testDocumentID) {
			t.Fatalf("incorrect resource binding: %v", args)
		}
		return pgconn.NewCommandTag("UPDATE 1"), nil
	}}
	db := &storage.PostgresStore{Pool: pool}
	w := httptest.NewRecorder()
	NewCommentsHandler(db, audit.NewAuditLogger(pool)).ResolveComment()(w, requestAs("POST", "/", "", &auth.UserContext{UserID: "caller"}))
	if w.Code != 200 || writes != 2 {
		t.Fatalf("got %d, %d writes", w.Code, writes)
	}
}

func TestDocumentLimitedTokenRejectsOtherDocumentWithoutQuery(t *testing.T) {
	w := httptest.NewRecorder()
	ok := requireDocumentAccess(w, requestAs("GET", "/", "", &auth.UserContext{UserID: "caller", DocumentIDs: []string{"0b7c9d4e-1f2a-4b3c-8d5e-6f7a8b9c0d1e"}}), &testPool{}, testDocumentID, "viewer")
	if ok || w.Code != 404 {
		t.Fatalf("got %v %d", ok, w.Code)
	}
}

func TestMalformedDocumentIDsAreRejectedBeforeTheDatabase(t *testing.T) {
	pool := &testPool{row: func(sql string, args ...any) pgx.Row {
		t.Fatalf("malformed ID reached the database: %v", args)
		return nil
	}}
	for _, id := range []string{"", "document", "6f1c2b8e0d1a4f5e9a632a7d1e0b9c44", "{6f1c2b8e-0d1a-4f5e-9a63-2a7d1e0b9c44}", "urn:uuid:6f1c2b8e-0d1a-4f5e-9a63-2a7d1e0b9c44", "6f1c2b8e-0d1a-4f5e-9a63-2a7d1e0b9c4g"} {
		w := httptest.NewRecorder()
		if requireDocumentAccess(w, requestAs("GET", "/", "", &auth.UserContext{UserID: "caller"}), pool, id, "viewer") || w.Code != 400 || !strings.Contains(w.Body.String(), `"VALIDATION_ERROR"`) {
			t.Fatalf("%q: got %d %s", id, w.Code, w.Body)
		}
	}
}

func TestDocumentIDsAreCheckedInCanonicalForm(t *testing.T) {
	pool := &testPool{row: func(sql string, args ...any) pgx.Row {
		if args[0] != testDocumentID {
			t.Fatalf("queried %v", args[0])
		}
		return testRow(func(dest ...any) error { *dest[0].(*string) = "viewer"; return nil })
	}}
	w := httptest.NewRecorder()
	limited := &auth.UserContext{UserID: "caller", DocumentIDs: []string{testDocumentID}}
	if !requireDocumentAccess(w, requestAs("GET", "/", "", limited), pool, strings.ToUpper(testDocumentID), "viewer") {
		t.Fatalf("upper-case spelling refused: %d %s", w.Code, w.Body)
	}
}

func TestSyncHandshakeValidatesAndCanonicalizesTheDocument(t *testing.T) {
	for _, tc := range []struct {
		name, query, role string
		status            int
	}{
		{"missing document_id", "peer_id=p", "", 400},
		{"malformed document_id", "document_id=abc&peer_id=p", "", 400},
		{"viewer cannot sync", "document_id=" + testDocumentID + "&peer_id=p", "viewer", 404},
		{"upper-case ID joins the canonical room", "document_id=" + strings.ToUpper(testDocumentID) + "&peer_id=p", "editor", 101},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool := &testPool{row: func(sql string, args ...any) pgx.Row {
				if tc.role == "" {
					t.Fatalf("malformed ID reached the database: %v", args)
				}
				return testRow(func(dest ...any) error { *dest[0].(*string) = tc.role; return nil })
			}}
			var joined string
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				joined = r.URL.Query().Get("document_id") + " " + r.URL.Query().Get("peer_id")
				w.WriteHeader(101)
			})
			w := httptest.NewRecorder()
			SyncDocumentAccess(&storage.PostgresStore{Pool: pool})(next).ServeHTTP(w, requestAs("GET", "/sync?"+tc.query, "", &auth.UserContext{UserID: "caller"}))
			if w.Code != tc.status || (tc.status == 101) != (joined == testDocumentID+" p") {
				t.Fatalf("got %d, joined %q: %s", w.Code, joined, w.Body)
			}
		})
	}
}
