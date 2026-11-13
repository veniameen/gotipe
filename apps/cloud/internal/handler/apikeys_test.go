package handler

import (
	"context"
	"errors"
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

var keyManager = &auth.UserContext{UserID: "caller", Scopes: []string{"account:manage", "documents:read"}}

func TestCreateAPIKeyRequiresScopesInsteadOfFailingInTheDatabase(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		status     int
		inserted   bool
	}{
		{"missing", `{"name":"CI"}`, 400, false},
		{"null", `{"name":"CI","scopes":null}`, 400, false},
		{"empty list", `{"name":"CI","scopes":[]}`, 201, true},
		{"held scope", `{"name":"CI","scopes":["documents:read"]}`, 201, true},
		{"scope the caller lacks", `{"name":"CI","scopes":["ai:use"]}`, 403, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var stored any
			pool := &testPool{exec: func(sql string, args ...any) (pgconn.CommandTag, error) {
				if strings.Contains(sql, "INSERT INTO api_keys") {
					if args[5] == nil || args[5].([]string) == nil {
						t.Fatalf("NULL scopes reach the NOT NULL column: %#v", args[5])
					}
					stored = args[5]
				}
				return pgconn.NewCommandTag("INSERT 0 1"), nil
			}}
			w := httptest.NewRecorder()
			NewAPIKeysHandler(&storage.PostgresStore{Pool: pool}, audit.NewAuditLogger(pool), "development").CreateAPIKey()(w, requestAs("POST", "/v1/api-keys", tc.body, keyManager))
			if w.Code != tc.status || (stored != nil) != tc.inserted {
				t.Fatalf("got %d, stored %v: %s", w.Code, stored, w.Body)
			}
			if tc.status == 400 && !strings.Contains(w.Body.String(), `"VALIDATION_ERROR"`) {
				t.Fatalf("not a validation error: %s", w.Body)
			}
			if tc.name == "empty list" && !strings.Contains(w.Body.String(), `"scopes":[]`) {
				t.Fatalf("empty scopes not returned as a list: %s", w.Body)
			}
		})
	}
}

func TestListAPIKeysReturnsAnEmptyListAndReportsRowErrors(t *testing.T) {
	for _, tc := range []struct {
		name   string
		err    error
		status int
		body   string
	}{
		{"no keys", nil, 200, `{"data":[]}`},
		{"interrupted read", errors.New("connection reset"), 500, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool := &testPool{query: func(string, ...any) (pgx.Rows, error) { return &emptyRows{err: tc.err}, nil }}
			w := httptest.NewRecorder()
			NewAPIKeysHandler(&storage.PostgresStore{Pool: pool}, nil, "development").ListAPIKeys()(w, requestAs("GET", "/v1/api-keys", "", keyManager))
			if w.Code != tc.status || (tc.body != "" && strings.TrimSpace(w.Body.String()) != tc.body) {
				t.Fatalf("got %d %s", w.Code, w.Body)
			}
		})
	}
}

func withRouteID(r *http.Request, id string) *http.Request {
	route := chi.NewRouteContext()
	route.URLParams.Add("id", id)
	return r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, route))
}

func TestDeleteAPIKeyRejectsMalformedIDsBeforeTheDatabase(t *testing.T) {
	for _, tc := range []struct {
		id      string
		matched string
		status  int
	}{
		{"not-a-key", "", 400},
		{"", "", 400},
		{"0B7C9D4E-1F2A-4B3C-8D5E-6F7A8B9C0D1E", "DELETE 0", 404},
		{"0b7c9d4e-1f2a-4b3c-8d5e-6f7a8b9c0d1e", "DELETE 1", 204},
	} {
		t.Run(tc.id, func(t *testing.T) {
			pool := &testPool{exec: func(sql string, args ...any) (pgconn.CommandTag, error) {
				if tc.matched == "" {
					t.Fatalf("malformed ID reached the database: %s %v", sql, args)
				}
				if strings.Contains(sql, "DELETE FROM api_keys") {
					if args[0] != "0b7c9d4e-1f2a-4b3c-8d5e-6f7a8b9c0d1e" || args[1] != "caller" {
						t.Fatalf("unexpected binding: %v", args)
					}
					return pgconn.NewCommandTag(tc.matched), nil
				}
				return pgconn.NewCommandTag("INSERT 0 1"), nil
			}}
			w := httptest.NewRecorder()
			NewAPIKeysHandler(&storage.PostgresStore{Pool: pool}, audit.NewAuditLogger(pool), "development").DeleteAPIKey()(w, withRouteID(requestAs("DELETE", "/", "", keyManager), tc.id))
			if w.Code != tc.status {
				t.Fatalf("got %d %s", w.Code, w.Body)
			}
		})
	}
}
