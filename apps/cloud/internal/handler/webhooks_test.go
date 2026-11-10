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
