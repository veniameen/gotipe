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
				if !strings.Contains(sql, "LEFT JOIN document_permissions") || args[0] != "document" || args[1] != "caller" {
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
			requireDocumentAccess(w, requestAs("GET", "/", "", tc.user), pool, "document", "viewer")
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
	for _, handle := range []http.HandlerFunc{NewCommentsHandler(db, nil).ListComments(), NewVersionsHandler(db, nil, nil).ListVersions(), NewPermissionsHandler(db, nil).ListPermissions()} {
		w := httptest.NewRecorder()
		handle(w, requestAs("GET", "/", "", &auth.UserContext{UserID: "caller"}))
		if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"data":[]}` {
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
		if strings.Contains(sql, "UPDATE comments") && (args[0] != "caller" || args[2] != "document") {
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
	ok := requireDocumentAccess(w, requestAs("GET", "/", "", &auth.UserContext{UserID: "caller", DocumentIDs: []string{"allowed"}}), &testPool{}, "document", "viewer")
	if ok || w.Code != 404 {
		t.Fatalf("got %v %d", ok, w.Code)
	}
}
