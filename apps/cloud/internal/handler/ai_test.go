package handler

import (
	"context"
	"errors"
	cloudAI "github.com/gotipe/cloud/internal/ai"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/middleware"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fakeAI func(context.Context, cloudAI.Request, func(string) error) (cloudAI.Result, error)

func (p fakeAI) Complete(ctx context.Context, r cloudAI.Request, emit func(string) error) (cloudAI.Result, error) {
	return p(ctx, r, emit)
}

func TestAIProviderFailureDoesNotReportSuccessOrChargeUsage(t *testing.T) {
	writes := 0
	pool := &testPool{row: func(string, ...any) pgx.Row {
		return testRow(func(dest ...any) error { *dest[0].(*int64) = 0; return nil })
	}, exec: func(sql string, _ ...any) (pgconn.CommandTag, error) {
		if strings.Contains(sql, "SET action='ai.request'") {
			writes++
		}
		return pgconn.NewCommandTag("INSERT 0 1"), nil
	}}
	provider := fakeAI(func(context.Context, cloudAI.Request, func(string) error) (cloudAI.Result, error) {
		return cloudAI.Result{}, errors.New("provider failure")
	})
	w := httptest.NewRecorder()
	NewAIHandler(&storage.PostgresStore{Pool: pool}, provider, "openai", "model", 100).Complete()(w, requestAs("POST", "/", `{"command":"complete","prompt":"test"}`, &auth.UserContext{UserID: "user", Plan: "starter"}))
	if w.Code != 503 || writes != 0 {
		t.Fatalf("provider failure counted as success: %d %d", w.Code, writes)
	}
}

func TestAIStreamsEscapedTextAndActualUsage(t *testing.T) {
	writes := 0
	pool := &testPool{row: func(string, ...any) pgx.Row {
		return testRow(func(dest ...any) error { *dest[0].(*int64) = 0; return nil })
	}, exec: func(sql string, _ ...any) (pgconn.CommandTag, error) {
		if strings.Contains(sql, "SET action='ai.request'") {
			writes++
		}
		return pgconn.NewCommandTag("INSERT 0 1"), nil
	}}
	provider := fakeAI(func(ctx context.Context, r cloudAI.Request, emit func(string) error) (cloudAI.Result, error) {
		if err := emit("hello\n\"world\""); err != nil {
			return cloudAI.Result{}, err
		}
		return cloudAI.Result{Usage: cloudAI.Usage{PromptTokens: 5, CompletionTokens: 3}}, nil
	})
	w := httptest.NewRecorder()
	NewAIHandler(&storage.PostgresStore{Pool: pool}, provider, "openai", "model", 100).Complete()(w, requestAs("POST", "/", `{"command":"complete","prompt":"test","stream":true}`, &auth.UserContext{UserID: "user", Plan: "starter"}))
	body := w.Body.String()
	if w.Code != 200 || writes != 1 || !strings.Contains(body, `{"text":"hello\n\"world\""}`) || !strings.Contains(body, `"prompt_tokens":5`) {
		t.Fatalf("bad stream: %d %d %s", w.Code, writes, body)
	}
}

// memoryIdempotency is Valkey for IdempotencyMiddleware: SET NX claims a key, and the
// release deletes it only while it still holds the claim.
type memoryIdempotency map[string]string

func (m memoryIdempotency) Get(_ context.Context, key string) ([]byte, error) {
	return []byte(m[key]), nil
}
func (m memoryIdempotency) Set(_ context.Context, key string, value []byte, _ time.Duration) error {
	m[key] = string(value)
	return nil
}
func (m memoryIdempotency) Eval(_ context.Context, script string, keys []string, args ...interface{}) (int64, error) {
	claim := args[0].(string)
	if strings.Contains(script, "'DEL'") {
		if m[keys[0]] != claim {
			return 0, nil
		}
		delete(m, keys[0])
		return 1, nil
	}
	if _, taken := m[keys[0]]; taken {
		return 0, nil
	}
	m[keys[0]] = claim
	return 1, nil
}

// D-235: a refusal before the provider answered changes nothing, so the
// Idempotency-Key does not keep it and a retry with the same key runs. A usage
// record that failed after the provider call is uncertain: the key answers 409.
func TestAIRefusalsAreNotKeptUnderTheIdempotencyKey(t *testing.T) {
	down := errors.New("database down")
	for _, tc := range []struct {
		name                      string
		noProvider                bool
		provider, reserve, record error
		status, retry, calls      int
	}{
		{name: "provider not configured", noProvider: true, status: 503, retry: 200, calls: 1},
		{name: "provider failure", provider: errors.New("provider down"), status: 503, retry: 200, calls: 2},
		{name: "quota not checked", reserve: down, status: 500, retry: 200, calls: 1},
		{name: "usage not recorded", record: down, status: 500, retry: 409, calls: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			failing, calls := true, 0
			pool := &testPool{row: func(string, ...any) pgx.Row {
				return testRow(func(dest ...any) error {
					if failing && tc.reserve != nil {
						return tc.reserve
					}
					*dest[0].(*int64) = 0
					return nil
				})
			}, exec: func(sql string, _ ...any) (pgconn.CommandTag, error) {
				if failing && tc.record != nil && strings.Contains(sql, "SET action='ai.request'") {
					return pgconn.CommandTag{}, tc.record
				}
				return pgconn.NewCommandTag("UPDATE 1"), nil
			}}
			var provider cloudAI.Provider = fakeAI(func(context.Context, cloudAI.Request, func(string) error) (cloudAI.Result, error) {
				calls++
				if failing && tc.provider != nil {
					return cloudAI.Result{}, tc.provider
				}
				return cloudAI.Result{Content: "done"}, nil
			})
			store := memoryIdempotency{}
			send := func() *httptest.ResponseRecorder {
				configured := provider
				if failing && tc.noProvider {
					configured = nil
				}
				h := middleware.IdempotencyMiddleware(store, 1<<20)(NewAIHandler(&storage.PostgresStore{Pool: pool}, configured, "openai", "model", 100).Complete())
				r := requestAs("POST", "/v1/ai/complete", `{"command":"complete","prompt":"test"}`, &auth.UserContext{UserID: "user", Plan: "starter"})
				r.Header.Set("Idempotency-Key", "same-key")
				w := httptest.NewRecorder()
				h.ServeHTTP(w, r)
				return w
			}
			if w := send(); w.Code != tc.status {
				t.Fatalf("first: %d %s", w.Code, w.Body)
			}
			failing = false
			w := send()
			if w.Code != tc.retry || calls != tc.calls || (tc.retry == 200 && !strings.Contains(w.Body.String(), "done")) {
				t.Fatalf("retry with the same key: %d %s, provider calls %d", w.Code, w.Body, calls)
			}
		})
	}
}

// A billing plan without a price is refused before anything runs: the key is free.
func TestUnconfiguredPlanIsNotKeptUnderTheIdempotencyKey(t *testing.T) {
	store := memoryIdempotency{}
	h := middleware.IdempotencyMiddleware(store, 1<<20)(NewBillingHandler(&storage.PostgresStore{}, nil, nil, map[string]string{"pro": ""}).CreateSubscription())
	r := requestAs("POST", "/v1/billing/subscribe", `{"plan":"pro","success_url":"https://example.test/ok","cancel_url":"https://example.test/no"}`, &auth.UserContext{UserID: "user", Plan: "free"})
	r.Header.Set("Idempotency-Key", "same-key")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 503 || len(store) != 0 {
		t.Fatalf("got %d %s; records %q", w.Code, w.Body, store)
	}
}
