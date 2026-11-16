package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// switchLimiter answers the rate limit script: allowed, refused or failing.
type switchLimiter struct {
	allow bool
	err   error
}

func (s *switchLimiter) Eval(context.Context, string, []string, ...interface{}) (int64, error) {
	if s.err != nil {
		return 0, s.err
	}
	if s.allow {
		return 1, nil
	}
	return 0, nil
}

// The AI limit sits below the idempotency layer, as in cmd/api: its refusal must
// not become the recorded result of the key.
func TestIdempotencyReleasesTheKeyAfterARateLimitRefusal(t *testing.T) {
	store := &idempotencyStore{data: map[string][]byte{}}
	limits := &switchLimiter{}
	limiter, err := NewRateLimiter(limits, 1, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	h := IdempotencyMiddleware(store, testBodyLimit)(limiter.Middleware("ai")(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.Write([]byte(`{"content":"done"}`))
	})))
	send := func(key string) *httptest.ResponseRecorder {
		r := idempotentRequest("/v1/ai/complete", `{"command":"complete"}`)
		r.Header.Set("Idempotency-Key", key)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	if w := send("refused"); w.Code != 429 || w.Header().Get("Retry-After") == "" || calls != 0 {
		t.Fatalf("refusal: %d %q calls=%d", w.Code, w.Header().Get("Retry-After"), calls)
	}
	if len(store.data) != 0 {
		t.Fatalf("the refusal stayed under the key: %q", store.data)
	}
	limits.allow = true
	if w := send("refused"); w.Code != 200 || calls != 1 {
		t.Fatalf("retry with the same key after Retry-After: %d %s calls=%d", w.Code, w.Body, calls)
	}
	limits.allow = false
	if w := send("refused"); w.Code != 200 || !strings.Contains(w.Body.String(), "done") || calls != 1 {
		t.Fatalf("a completed result is replayed, not limited again: %d %s calls=%d", w.Code, w.Body, calls)
	}
	limits.err = errors.New("valkey unavailable")
	if w := send("limiter-down"); w.Code != 503 || calls != 1 || len(store.data) != 1 {
		t.Fatalf("limiter failure: %d calls=%d records=%d", w.Code, calls, len(store.data))
	}
	limits.err, limits.allow = nil, true
	if w := send("limiter-down"); w.Code != 200 || calls != 2 {
		t.Fatalf("retry after a limiter failure: %d calls=%d", w.Code, calls)
	}
}

func TestIdempotencySaysToUseANewKeyWhenTheReleaseFails(t *testing.T) {
	store := &idempotencyStore{data: map[string][]byte{}, releaseErr: errors.New("valkey unavailable")}
	h := IdempotencyMiddleware(store, testBodyLimit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		MarkNotRun(r)
		w.WriteHeader(429)
	}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, idempotentRequest("/v1/ai/complete", `{}`))
	if w.Code != 503 || !strings.Contains(w.Body.String(), "new key") {
		t.Fatalf("got %d %s", w.Code, w.Body)
	}
}

func TestIdempotencyNeverKeepsASecretReply(t *testing.T) {
	store := &idempotencyStore{data: map[string][]byte{}}
	calls := 0
	h := IdempotencyMiddleware(store, testBodyLimit, func(http.ResponseWriter, *http.Request, []byte, []byte) bool {
		t.Fatal("a secret reply has no body to authorize")
		return false
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		MarkSecretReply(r)
		w.WriteHeader(201)
		w.Write([]byte(`{"key":"gt_live_sk_secret"}`))
	}))
	first := httptest.NewRecorder()
	h.ServeHTTP(first, idempotentRequest("/v1/api-keys", `{"name":"CI","scopes":[]}`))
	if first.Code != 201 || !strings.Contains(first.Body.String(), "gt_live_sk_secret") {
		t.Fatalf("the caller lost the key: %d %s", first.Code, first.Body)
	}
	for key, record := range store.data {
		var saved cachedResponse // the body is base64 in the record
		if json.Unmarshal(record, &saved) != nil || strings.Contains(string(record)+string(saved.Body), "gt_live") {
			t.Fatalf("record %s keeps the key: %s", key, record)
		}
	}
	repeat := httptest.NewRecorder()
	h.ServeHTTP(repeat, idempotentRequest("/v1/api-keys", `{"name":"CI","scopes":[]}`))
	if repeat.Code != 409 || !strings.Contains(repeat.Body.String(), "status 201") || strings.Contains(repeat.Body.String(), "gt_live") || calls != 1 {
		t.Fatalf("repeat: %d %s calls=%d", repeat.Code, repeat.Body, calls)
	}
}

// A body the router accepts is accepted with a key too; above the limit it is 413.
func TestIdempotencyAcceptsBodiesUpToTheRouterLimit(t *testing.T) {
	calls := 0
	h := IdempotencyMiddleware(&idempotencyStore{data: map[string][]byte{}}, testBodyLimit)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(201)
	}))
	for _, tc := range []struct {
		size, status int
	}{{10<<20 + 1, 201}, {testBodyLimit + 1, 413}} {
		r := idempotentRequest("/v1/documents", strings.Repeat("x", tc.size))
		r.Header.Set("Idempotency-Key", "body-"+http.StatusText(tc.status))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("body of %d bytes: %d %s", tc.size, w.Code, w.Body)
		}
	}
	if calls != 1 {
		t.Fatalf("calls=%d", calls)
	}
}
