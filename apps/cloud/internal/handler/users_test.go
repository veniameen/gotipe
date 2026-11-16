package handler

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
)

// An account that is gone is 404; a database that does not answer is 503.
func TestCurrentUserTellsMissingAccountFromDatabaseFailure(t *testing.T) {
	for _, tc := range []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"deleted account", pgx.ErrNoRows, 404, `"NOT_FOUND"`},
		{"database down", errors.New("dial tcp: connection refused"), 503, `"SERVICE_UNAVAILABLE"`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool := &testPool{row: func(string, ...any) pgx.Row {
				return testRow(func(...any) error { return tc.err })
			}}
			w := httptest.NewRecorder()
			NewUsersHandler(&storage.PostgresStore{Pool: pool}).GetMe()(w, requestAs("GET", "/v1/users/me", "", &auth.UserContext{UserID: testUserID}))
			if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.code) {
				t.Fatalf("got %d %s, want %d %s", w.Code, w.Body, tc.status, tc.code)
			}
		})
	}
}
