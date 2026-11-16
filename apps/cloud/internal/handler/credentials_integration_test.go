//go:build integration

package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/testdb"
	"golang.org/x/crypto/bcrypt"
)

// Credential lookups on a real pool: unknown credentials and an account without a
// password are 401; once the pool stops answering, the same requests are 503.
func TestCredentialLookupsAgainstPostgres(t *testing.T) {
	db := testdb.Open(t)
	ctx := context.Background()
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	var ownerID string
	if err := db.Pool.QueryRow(ctx, `INSERT INTO users(email,password_hash)VALUES('owner@test.invalid',$1)RETURNING id`, string(hash)).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO users(email)VALUES('nopassword@test.invalid')`); err != nil {
		t.Fatal(err)
	}
	key, prefix := auth.GenerateKey("development")
	if _, err := db.Pool.Exec(ctx, `INSERT INTO api_keys(user_id,name,key_hash,prefix,scopes)VALUES($1,'CI',$2,$3,ARRAY['documents:read'])`, ownerID, auth.HashKey(key), prefix); err != nil {
		t.Fatal(err)
	}
	jwt := testJWT(t)
	tokens := NewAuthHandler(db, jwt, nil).CreateToken()
	me := auth.AuthMiddleware(jwt, auth.NewAPIKeyService(db.Pool), nil)(NewUsersHandler(db).GetMe())
	token := func(body string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		tokens(w, httptest.NewRequest("POST", "/v1/auth/token", strings.NewReader(body)))
		return w
	}
	withKey := func(credential string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "/v1/users/me", nil)
		r.Header.Set("Authorization", "Bearer "+credential)
		w := httptest.NewRecorder()
		me.ServeHTTP(w, r)
		return w
	}
	password := `{"grant_type":"password","email":"owner@test.invalid","password":"correct-password"}`
	apiKey := `{"grant_type":"api_key","api_key":"` + key + `"}`
	check := func(name string, w *httptest.ResponseRecorder, status int, code string) {
		t.Helper()
		if w.Code != status || !strings.Contains(w.Body.String(), code) {
			t.Fatalf("%s: got %d %s, want %d %s", name, w.Code, w.Body, status, code)
		}
	}
	check("password", token(password), 200, "access_token")
	check("wrong password", token(strings.Replace(password, "correct-", "wrong-", 1)), 401, `"UNAUTHORIZED"`)
	check("unknown email", token(strings.Replace(password, "owner@", "nobody@", 1)), 401, `"UNAUTHORIZED"`)
	check("account without a password", token(`{"grant_type":"password","email":"nopassword@test.invalid","password":"anything"}`), 401, `"UNAUTHORIZED"`)
	check("api key grant", token(apiKey), 200, "access_token")
	check("unknown api key grant", token(`{"grant_type":"api_key","api_key":"gt_test_sk_unknown"}`), 401, `"INVALID_API_KEY"`)
	check("api key", withKey(key), 200, ownerID)
	check("unknown api key", withKey("gt_test_sk_unknown"), 401, `"INVALID_API_KEY"`)

	db.Pool.Close()
	check("password, pool closed", token(password), 503, `"SERVICE_UNAVAILABLE"`)
	check("api key grant, pool closed", token(apiKey), 503, `"SERVICE_UNAVAILABLE"`)
	check("api key, pool closed", withKey(key), 503, `"SERVICE_UNAVAILABLE"`)
	w := httptest.NewRecorder()
	NewUsersHandler(db).GetMe()(w, httptest.NewRequest("GET", "/v1/users/me", nil).WithContext(auth.WithUser(ctx, &auth.UserContext{UserID: ownerID})))
	check("users/me, pool closed", w, http.StatusServiceUnavailable, `"SERVICE_UNAVAILABLE"`)
}
