package middleware

import (
	"context"
	"errors"
	"github.com/gotipe/cloud/internal/auth"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type idempotencyStore struct {
	mu                                sync.Mutex
	data                              map[string][]byte
	claimErr, errorOnSave, releaseErr error
}

// testBodyLimit is the router's limit with the default EXPORT_MAX_DOCUMENT_SIZE.
const testBodyLimit = 11 << 20

func (s *idempotencyStore) Get(_ context.Context, key string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]byte(nil), s.data[key]...), nil
}
func (s *idempotencyStore) Set(_ context.Context, key string, value []byte, _ time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.errorOnSave != nil {
		return s.errorOnSave
	}
	s.data[key] = append([]byte(nil), value...)
	return nil
}
func (s *idempotencyStore) Eval(_ context.Context, script string, keys []string, args ...interface{}) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if script == releaseIdempotency {
		if s.releaseErr != nil {
			return 0, s.releaseErr
		}
		if string(s.data[keys[0]]) != args[0].(string) {
			return 0, nil
		}
		delete(s.data, keys[0])
		return 1, nil
	}
	if s.claimErr != nil {
		return 0, s.claimErr
	}
	if s.data[keys[0]] != nil {
		return 0, nil
	}
	s.data[keys[0]] = []byte(args[0].(string))
	return 1, nil
}
func idempotentRequest(path, body string) *http.Request {
	r := httptest.NewRequest("POST", path, strings.NewReader(body))
	r.Header.Set("Idempotency-Key", "same-key")
	r.Header.Set("Content-Type", "application/json")
	return r.WithContext(auth.WithUser(r.Context(), &auth.UserContext{UserID: "user"}))
}
func TestIdempotencyReplaysOnlySameRequest(t *testing.T) {
	store := &idempotencyStore{data: map[string][]byte{}}
	calls := 0
	h := IdempotencyMiddleware(store, testBodyLimit)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(201)
		w.Write([]byte(`{"id":"one"}`))
	}))
	for _, test := range []struct {
		path, body string
		status     int
	}{{"/documents", `{"title":"one"}`, 201}, {"/documents", `{"title":"one"}`, 201}, {"/documents", `{"title":"two"}`, 409}, {"/exports", `{"title":"one"}`, 409}} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, idempotentRequest(test.path, test.body))
		if w.Code != test.status {
			t.Fatalf("%s %s status%d", test.path, test.body, w.Code)
		}
	}
	if calls != 1 {
		t.Fatalf("duplicated writes:%d", calls)
	}
}
func TestIdempotencyConcurrentRequestDoesNotDuplicateMutation(t *testing.T) {
	store := &idempotencyStore{data: map[string][]byte{}}
	started := make(chan struct{})
	finish := make(chan struct{})
	done := make(chan struct{})
	h := IdempotencyMiddleware(store, testBodyLimit)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { close(started); <-finish; w.WriteHeader(201) }))
	go func() { defer close(done); h.ServeHTTP(httptest.NewRecorder(), idempotentRequest("/documents", `{}`)) }()
	<-started
	w := httptest.NewRecorder()
	h.ServeHTTP(w, idempotentRequest("/documents", `{}`))
	if w.Code != 409 {
		t.Fatalf("concurrent status%d", w.Code)
	}
	close(finish)
	<-done
}
func TestIdempotencyStorageFailuresPreserveUncertainClaim(t *testing.T) {
	store := &idempotencyStore{data: map[string][]byte{}, errorOnSave: errors.New("unavailable")}
	calls := 0
	h := IdempotencyMiddleware(store, testBodyLimit)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { calls++; w.WriteHeader(201) }))
	for _, want := range []int{503, 409} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, idempotentRequest("/documents", `{}`))
		if w.Code != want {
			t.Fatalf("got%d want%d", w.Code, want)
		}
	}
	if calls != 1 {
		t.Fatal("uncertain write repeated")
	}
	store = &idempotencyStore{data: map[string][]byte{}, claimErr: errors.New("unavailable")}
	h = IdempotencyMiddleware(store, testBodyLimit)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("mutation without durable claim") }))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, idempotentRequest("/documents", `{}`))
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
}
func TestIdempotencyRejectsStreamingAI(t *testing.T) {
	h := IdempotencyMiddleware(&idempotencyStore{data: map[string][]byte{}}, testBodyLimit)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("stream buffered") }))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, idempotentRequest("/v1/ai/complete", `{"stream":true}`))
	if w.Code != 400 {
		t.Fatal(w.Code)
	}
}

func TestIdempotencyDoesNotReplayAcrossRestrictedCredentials(t *testing.T) {
	store := &idempotencyStore{data: map[string][]byte{}}
	calls := 0
	h := IdempotencyMiddleware(store, testBodyLimit)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { calls++; w.Write([]byte(`{"secret":"private"}`)) }))
	first := httptest.NewRecorder()
	h.ServeHTTP(first, idempotentRequest("/documents", `{}`))
	request := idempotentRequest("/documents", `{}`)
	request = request.WithContext(auth.WithUser(request.Context(), &auth.UserContext{UserID: "user", DocumentIDs: []string{"other"}}))
	replay := httptest.NewRecorder()
	h.ServeHTTP(replay, request)
	if replay.Code != 409 || strings.Contains(replay.Body.String(), "private") || calls != 1 {
		t.Fatalf("credential restriction bypass: %d %s", replay.Code, replay.Body)
	}
}
func TestIdempotencyChecksLiveAuthorizationBeforeReplay(t *testing.T) {
	store := &idempotencyStore{data: map[string][]byte{}}
	calls := 0
	allowed := true
	h := IdempotencyMiddleware(store, testBodyLimit, func(w http.ResponseWriter, _ *http.Request, _, _ []byte) bool {
		if !allowed {
			http.Error(w, "revoked", 404)
		}
		return allowed
	})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { calls++; w.Write([]byte(`{"secret":"private"}`)) }))
	h.ServeHTTP(httptest.NewRecorder(), idempotentRequest("/documents", `{}`))
	allowed = false
	replay := httptest.NewRecorder()
	h.ServeHTTP(replay, idempotentRequest("/documents", `{}`))
	if replay.Code != 404 || strings.Contains(replay.Body.String(), "private") || calls != 1 {
		t.Fatalf("revocation bypass: %d %s", replay.Code, replay.Body)
	}
}

func TestIdempotencyKeepsOnlyTheOutcomeOfOversizedReplies(t *testing.T) {
	store := &idempotencyStore{data: map[string][]byte{}}
	calls := 0
	large := strings.Repeat("x", MaxReplayBody+1)
	h := IdempotencyMiddleware(store, testBodyLimit, func(http.ResponseWriter, *http.Request, []byte, []byte) bool {
		t.Fatal("an omitted reply has no body to authorize")
		return false
	})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(201)
		w.Write([]byte(large))
	}))
	first := httptest.NewRecorder()
	h.ServeHTTP(first, idempotentRequest("/v1/documents", `{"title":"big"}`))
	if first.Code != 201 || first.Body.Len() != len(large) {
		t.Fatalf("first reply truncated: %d %d", first.Code, first.Body.Len())
	}
	for key, record := range store.data {
		if len(record) > 1024 || strings.Contains(string(record), "xxxx") {
			t.Fatalf("record %s stores the oversized body (%d bytes)", key, len(record))
		}
	}
	repeat := httptest.NewRecorder()
	h.ServeHTTP(repeat, idempotentRequest("/v1/documents", `{"title":"big"}`))
	if repeat.Code != 409 || !strings.Contains(repeat.Body.String(), "status 201") || calls != 1 {
		t.Fatalf("repeat: %d %s calls=%d", repeat.Code, repeat.Body, calls)
	}
}
