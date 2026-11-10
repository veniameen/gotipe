package handler

import (
	"context"
	"errors"
	"github.com/gotipe/cloud/internal/auth"
	"net/http/httptest"
	"testing"
	"time"
)

type revokeStore func(string, time.Duration) error

func (f revokeStore) BlocklistAdd(_ context.Context, id string, ttl time.Duration) error {
	return f(id, ttl)
}
func TestRevocationCoversFullTokenLifetime(t *testing.T) {
	for _, failed := range []bool{false, true} {
		user := &auth.UserContext{UserID: "u", TokenID: "current", ExpiresAt: time.Now().Add(72 * time.Hour)}
		h := NewAuthHandler(nil, nil, revokeStore(func(id string, ttl time.Duration) error {
			if id != "current" || ttl < 71*time.Hour {
				t.Fatalf("short revocation %s %s", id, ttl)
			}
			if failed {
				return errors.New("offline")
			}
			return nil
		}))
		w := httptest.NewRecorder()
		h.RevokeToken()(w, requestAs("POST", "/v1/auth/revoke", `{}`, user))
		want := 200
		if failed {
			want = 503
		}
		if w.Code != want {
			t.Fatalf("got %d want %d", w.Code, want)
		}
	}
}
