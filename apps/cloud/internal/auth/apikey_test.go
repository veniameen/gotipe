package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// keyLookup answers the API key query with a key of the user "owner", or with err.
type keyLookup struct{ err error }

func (k keyLookup) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("unexpected query")
}
func (k keyLookup) QueryRow(context.Context, string, ...any) pgx.Row { return k }
func (k keyLookup) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.NewCommandTag("UPDATE 1"), nil
}
func (k keyLookup) Scan(dest ...any) error {
	if k.err != nil {
		return k.err
	}
	*dest[0].(*string) = "owner"
	*dest[1].(*string) = "pro"
	*dest[2].(*[]string) = []string{"documents:read"}
	return nil
}

// A key the database does not know is invalid; a database that does not answer
// says nothing about the key, so the request is refused as unavailable.
func TestAPIKeyAuthenticationTellsUnknownKeysFromDatabaseFailures(t *testing.T) {
	for _, tc := range []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"known key", nil, http.StatusNoContent, ""},
		{"unknown key", pgx.ErrNoRows, http.StatusUnauthorized, "INVALID_API_KEY"},
		{"database down", errors.New("dial tcp: connection refused"), http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if user := UserFromContext(r.Context()); user == nil || user.UserID != "owner" || user.APIKeyHash == "" {
					t.Fatalf("authenticated as %+v", user)
				}
				w.WriteHeader(http.StatusNoContent)
			})
			r := httptest.NewRequest("GET", "/v1/users/me", nil)
			r.Header.Set("Authorization", "Bearer gt_test_sk_0123456789abcdef")
			w := httptest.NewRecorder()
			AuthMiddleware(nil, NewAPIKeyService(keyLookup{tc.err}), nil)(next).ServeHTTP(w, r)
			if w.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", w.Code, tc.status, w.Body)
			}
			if tc.code == "" {
				return
			}
			var body struct{ Error struct{ Code string } }
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Error.Code != tc.code {
				t.Fatalf("code %q, want %q: %s", body.Error.Code, tc.code, w.Body)
			}
		})
	}
}
