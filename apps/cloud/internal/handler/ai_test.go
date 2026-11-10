package handler

import (
	"context"
	"errors"
	cloudAI "github.com/gotipe/cloud/internal/ai"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"net/http/httptest"
	"strings"
	"testing"
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
