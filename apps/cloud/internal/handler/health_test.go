package handler

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadyzReportsStatesWithoutErrorDetails(t *testing.T) {
	var logs bytes.Buffer
	failure := errors.New("dial tcp 10.0.0.3:6379: connect: connection refused (password=hunter2)")
	ok := func(context.Context) error { return nil }
	h := Readyz(slog.New(slog.NewTextHandler(&logs, nil)), map[string]ReadinessCheck{
		"postgres": ok,
		"valkey":   func(context.Context) error { return failure },
		"r2":       ok,
	})
	w := httptest.NewRecorder()
	h(w, httptest.NewRequest("GET", "/readyz", nil))
	body := strings.TrimSpace(w.Body.String())
	if w.Code != 503 || body != `{"checks":{"postgres":"ok","r2":"ok","valkey":"unavailable"},"status":"degraded"}` {
		t.Fatalf("got %d %s", w.Code, body)
	}
	if !strings.Contains(logs.String(), "dependency=valkey") || !strings.Contains(logs.String(), "10.0.0.3:6379") {
		t.Fatalf("failure detail not logged: %s", logs.String())
	}

	w = httptest.NewRecorder()
	Readyz(slog.New(slog.NewTextHandler(&logs, nil)), map[string]ReadinessCheck{"postgres": ok, "valkey": ok, "r2": ok})(w, httptest.NewRequest("GET", "/readyz", nil))
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"checks":{"postgres":"ok","r2":"ok","valkey":"ok"},"status":"ok"}` {
		t.Fatalf("got %d %s", w.Code, w.Body)
	}
}

func TestReadyzChecksRunConcurrently(t *testing.T) {
	// Each check waits for the other to start: run one after another, the first
	// would hold until the deadline and report the dependency unavailable.
	first, second := make(chan struct{}), make(chan struct{})
	meet := func(mine, theirs chan struct{}) ReadinessCheck {
		return func(ctx context.Context) error {
			close(mine)
			select {
			case <-theirs:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}
	w := httptest.NewRecorder()
	Readyz(slog.New(slog.DiscardHandler), map[string]ReadinessCheck{"postgres": meet(first, second), "valkey": meet(second, first)})(w, httptest.NewRequest("GET", "/readyz", nil))
	if w.Code != 200 {
		t.Fatalf("checks blocked each other: %d %s", w.Code, w.Body)
	}
}
