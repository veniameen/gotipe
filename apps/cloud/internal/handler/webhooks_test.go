package handler

import (
	"errors"
	"fmt"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/webhook"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWebhookAcknowledgesOnlyVerifiedDurableEvents(t *testing.T) {
	body := []byte(fmt.Sprintf(`{"id":"evt_test","type":"customer.subscription.updated","api_version":%q,"data":{"object":{"id":"sub_test"}}}`, stripe.APIVersion))
	signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{Payload: body, Secret: "test-secret"})
	for _, test := range []struct {
		name      string
		signature string
		dbErr     error
		want      int
		writes    int
	}{
		{"valid", signed.Header, nil, 200, 1},
		{"signature", "invalid", nil, 400, 0},
		{"durability", signed.Header, errors.New("offline"), 503, 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			calls := 0
			pool := &testPool{exec: func(sql string, args ...any) (pgconn.CommandTag, error) {
				calls++
				if !strings.Contains(sql, "ON CONFLICT (id) DO NOTHING") || args[0] != "evt_test" {
					t.Fatal("not an idempotent durable insert")
				}
				return pgconn.NewCommandTag("INSERT 0 1"), test.dbErr
			}}
			h := NewWebhooksHandler(&storage.PostgresStore{Pool: pool}, "test-secret", slog.New(slog.NewTextHandler(io.Discard, nil)))
			r := httptest.NewRequest("POST", "/v1/webhooks/stripe", strings.NewReader(string(body)))
			r.Header.Set("Stripe-Signature", test.signature)
			w := httptest.NewRecorder()
			h.StripeWebhook()(w, r)
			if w.Code != test.want || calls != test.writes {
				t.Fatalf("status %d writes %d body %s", w.Code, calls, w.Body.String())
			}
		})
	}
}

// Stripe signs events with the endpoint's API version, which need not be the one
// stripe-go v81 is built for. A signed event of any version is stored.
func TestWebhookAcceptsSignedEventsOfAnyAPIVersion(t *testing.T) {
	for _, version := range []string{"2025-03-31.basil", "2023-10-16", stripe.APIVersion} {
		body := []byte(fmt.Sprintf(`{"id":"evt_test","type":"invoice.paid","api_version":%q,"data":{"object":{"id":"in_test"}}}`, version))
		signed := webhook.GenerateTestSignedPayload(&webhook.UnsignedPayload{Payload: body, Secret: "test-secret"})
		writes := 0
		pool := &testPool{exec: func(string, ...any) (pgconn.CommandTag, error) {
			writes++
			return pgconn.NewCommandTag("INSERT 0 1"), nil
		}}
		h := NewWebhooksHandler(&storage.PostgresStore{Pool: pool}, "test-secret", slog.New(slog.NewTextHandler(io.Discard, nil)))
		r := httptest.NewRequest("POST", "/v1/webhooks/stripe", strings.NewReader(string(body)))
		r.Header.Set("Stripe-Signature", signed.Header)
		w := httptest.NewRecorder()
		h.StripeWebhook()(w, r)
		if w.Code != 200 || writes != 1 {
			t.Fatalf("API version %s: status %d writes %d %s", version, w.Code, writes, w.Body)
		}
		tampered := httptest.NewRequest("POST", "/v1/webhooks/stripe", strings.NewReader(strings.Replace(string(body), "in_test", "in_other", 1)))
		tampered.Header.Set("Stripe-Signature", signed.Header)
		w = httptest.NewRecorder()
		h.StripeWebhook()(w, tampered)
		if w.Code != 400 || writes != 1 {
			t.Fatalf("API version %s: tampered body accepted: %d", version, w.Code)
		}
	}
}
