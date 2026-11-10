package handler

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

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
