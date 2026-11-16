package handler

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// Unknown credentials are 401; a database that does not answer is 503, because it
// says nothing about the credential.
func TestTokenGrantsTellUnknownCredentialsFromDatabaseFailures(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		err        error
		status     int
		code       string
	}{
		{"unknown email", `{"grant_type":"password","email":"nobody@example.test","password":"secret"}`, pgx.ErrNoRows, 401, `"UNAUTHORIZED"`},
		{"password, database down", `{"grant_type":"password","email":"owner@example.test","password":"secret"}`, errors.New("dial tcp: connection refused"), 503, `"SERVICE_UNAVAILABLE"`},
		{"unknown api key", `{"grant_type":"api_key","api_key":"gt_test_sk_unknown"}`, pgx.ErrNoRows, 401, `"INVALID_API_KEY"`},
		{"api key, database down", `{"grant_type":"api_key","api_key":"gt_test_sk_valid"}`, errors.New("dial tcp: connection refused"), 503, `"SERVICE_UNAVAILABLE"`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool := &testPool{row: func(string, ...any) pgx.Row {
				return testRow(func(...any) error { return tc.err })
			}}
			w := httptest.NewRecorder()
			NewAuthHandler(&storage.PostgresStore{Pool: pool}, testJWT(t), nil).CreateToken()(w, requestAs("POST", "/v1/auth/token", tc.body, nil))
			if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.code) {
				t.Fatalf("got %d %s, want %d %s", w.Code, w.Body, tc.status, tc.code)
			}
		})
	}
}

func TestPasswordGrantVerifiesPassword(t *testing.T) {
	hash, err := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, password, hash string
		status               int
	}{
		{"correct", "correct-password", string(hash), 200},
		{"wrong", "wrong-password", string(hash), 401},
		{"empty hash", "anything", "", 401},
		{"malformed hash", "anything", "plaintext-password", 401},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool := &testPool{row: func(sql string, args ...any) pgx.Row {
				if len(args) != 1 || args[0] != "owner@example.test" {
					t.Fatalf("unexpected credential query args: %v", args)
				}
				return testRow(func(dest ...any) error {
					*dest[0].(*string) = "owner"
					*dest[1].(*string) = "starter"
					*dest[2].(*string) = tc.hash
					return nil
				})
			}}
			service := testJWT(t)
			h := NewAuthHandler(&storage.PostgresStore{Pool: pool}, service, nil)
			body, _ := json.Marshal(TokenRequest{GrantType: "password", Email: "owner@example.test", Password: tc.password})
			r := requestAs("POST", "/v1/auth/token", string(body), nil)
			w := httptest.NewRecorder()
			h.CreateToken()(w, r)
			if w.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", w.Code, tc.status, w.Body.String())
			}
			if tc.status == 200 {
				var res TokenResponse
				if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
					t.Fatal(err)
				}
				claims, err := service.Validate(res.AccessToken)
				if err != nil || claims.UserID != "owner" {
					t.Fatalf("invalid signed token: %v", err)
				}
			}
		})
	}
}
