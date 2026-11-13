package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type limiterStore func([]string, []interface{}) (int64, error)

func (f limiterStore) Eval(_ context.Context, _ string, keys []string, args ...interface{}) (int64, error) {
	return f(keys, args)
}
func TestIPLimiterFailsClosedAndIgnoresForwardedIdentity(t *testing.T) {
	for _, test := range []struct {
		result int64
		err    error
		want   int
	}{{1, nil, 204}, {0, nil, 429}, {0, errors.New("offline"), 503}} {
		limiter, err := NewRateLimiter(limiterStore(func(keys []string, args []interface{}) (int64, error) {
			if keys[0] != "rl:auth:192.0.2.1" {
				t.Fatalf("untrusted address used: %v", keys)
			}
			if len(args) != 4 || args[3] == "" {
				t.Fatal("missing unique rate entry")
			}
			return test.result, test.err
		}), 10, time.Minute)
		if err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest("POST", "/v1/auth/token", nil)
		r.RemoteAddr = "192.0.2.1:3210"
		r.Header.Set("X-Forwarded-For", "attacker")
		w := httptest.NewRecorder()
		limiter.IPMiddleware(ClientAddresses{})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })).ServeHTTP(w, r)
		if w.Code != test.want {
			t.Fatalf("got %d want %d", w.Code, test.want)
		}
	}
}
func TestLimiterRejectsInvalidConfiguration(t *testing.T) {
	if _, err := NewRateLimiter(nil, 10, time.Minute); err == nil {
		t.Fatal("accepted nil store")
	}
	if _, err := NewRateLimiter(limiterStore(nil), 0, time.Minute); err == nil {
		t.Fatal("accepted zero limit")
	}
}
