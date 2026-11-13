package handler

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	cloudAI "github.com/gotipe/cloud/internal/ai"
	"github.com/gotipe/cloud/internal/auth"
	"github.com/gotipe/cloud/internal/storage"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/prometheus/client_golang/prometheus"
)

// sample reads one series from a registry: a counter's or gauge's value, or a
// histogram's sample count. Series with other label values are ignored.
func sample(t *testing.T, gatherer prometheus.Gatherer, name string, labels map[string]string) (float64, bool) {
	t.Helper()
	families, err := gatherer.Gather()
	if err != nil {
		t.Fatal(err)
	}
	for _, family := range families {
		if family.GetName() != name {
			continue
		}
	series:
		for _, metric := range family.GetMetric() {
			for _, pair := range metric.GetLabel() {
				if want, ok := labels[pair.GetName()]; ok && want != pair.GetValue() {
					continue series
				}
			}
			switch {
			case metric.GetCounter() != nil:
				return metric.GetCounter().GetValue(), true
			case metric.GetGauge() != nil:
				return metric.GetGauge().GetValue(), true
			case metric.GetHistogram() != nil:
				return float64(metric.GetHistogram().GetSampleCount()), true
			}
		}
	}
	return 0, false
}

func TestHTTPMetricsRecordRouteStatusAndDuration(t *testing.T) {
	labels := map[string]string{"method": "PATCH", "path": "/v1/metrics-test/{id}", "status": "409"}
	before, _ := sample(t, prometheus.DefaultGatherer, "gotipe_http_requests_total", labels)
	HTTPMetrics{}.ObserveRequest("PATCH", "/v1/metrics-test/{id}", 409, 20*time.Millisecond)
	after, _ := sample(t, prometheus.DefaultGatherer, "gotipe_http_requests_total", labels)
	durations, _ := sample(t, prometheus.DefaultGatherer, "gotipe_http_request_duration_seconds", map[string]string{"method": "PATCH", "path": "/v1/metrics-test/{id}"})
	if after != before+1 || durations < 1 {
		t.Fatalf("requests %v -> %v, durations %v", before, after, durations)
	}
}

func TestAIMetricsCountProviderCallsWithBoundedLabels(t *testing.T) {
	count := func(provider, model, status string) float64 {
		value, _ := sample(t, prometheus.DefaultGatherer, "gotipe_ai_requests_total", map[string]string{"provider": provider, "model": model, "status": status})
		return value
	}
	success, failure, other := count("anthropic", "metrics-model", "success"), count("anthropic", "unknown", "error"), count("other", "metrics-model", "success")
	pool := &testPool{row: func(string, ...any) pgx.Row {
		return testRow(func(dest ...any) error { *dest[0].(*int64) = 0; return nil })
	}, exec: func(string, ...any) (pgconn.CommandTag, error) { return pgconn.NewCommandTag("UPDATE 1"), nil }}
	for _, tc := range []struct {
		provider, model string
		err             error
	}{
		{"anthropic", "metrics-model", nil},
		{"anthropic", "attacker-chosen-model-name", errors.New("provider returned HTTP 404")},
	} {
		provider := fakeAI(func(context.Context, cloudAI.Request, func(string) error) (cloudAI.Result, error) {
			return cloudAI.Result{Content: "ok"}, tc.err
		})
		body := `{"command":"complete","prompt":"test","provider":"` + tc.provider + `","model":"` + tc.model + `"}`
		NewAIHandler(&storage.PostgresStore{Pool: pool}, provider, "openai", "model", 100).Complete()(httptest.NewRecorder(), requestAs("POST", "/", body, &auth.UserContext{UserID: "user", Plan: "starter"}))
	}
	observeAIRequest("self-hosted", "metrics-model", nil)
	if count("anthropic", "metrics-model", "success") != success+1 || count("anthropic", "unknown", "error") != failure+1 || count("other", "metrics-model", "success") != other+1 {
		t.Fatal("provider calls not counted")
	}
	if _, found := sample(t, prometheus.DefaultGatherer, "gotipe_ai_requests_total", map[string]string{"model": "attacker-chosen-model-name"}); found {
		t.Fatal("a rejected model name became a label value")
	}
}

func TestDocumentCountIsReadAtScrapeAndOmittedOnFailure(t *testing.T) {
	queries := 0
	var failure error
	pool := &testPool{row: func(sql string, _ ...any) pgx.Row {
		queries++
		if sql != `SELECT count(*) FROM documents` {
			t.Fatalf("unexpected query %s", sql)
		}
		return testRow(func(dest ...any) error {
			if failure != nil {
				return failure
			}
			*dest[0].(*int64) = 42
			return nil
		})
	}}
	var logs bytes.Buffer
	collector := newDocumentCount(pool, slog.New(slog.NewTextHandler(&logs, nil)), time.Hour)
	registry := prometheus.NewRegistry()
	registry.MustRegister(collector)
	for range 2 {
		if value, found := sample(t, registry, "gotipe_documents_total", nil); !found || value != 42 {
			t.Fatalf("got %v %v", value, found)
		}
	}
	if queries != 1 {
		t.Fatalf("counted %d times within one interval", queries)
	}
	collector.counted = time.Time{}
	failure = errors.New("database unavailable")
	if value, found := sample(t, registry, "gotipe_documents_total", nil); found {
		t.Fatalf("reported %v without a fresh count", value)
	}
	if !strings.Contains(logs.String(), "database unavailable") {
		t.Fatalf("failure not logged: %s", logs.String())
	}
	if err := RegisterDocumentCount(storage.Database(pool), slog.New(slog.DiscardHandler)); err != nil {
		t.Fatalf("gotipe_documents_total cannot join the default registry: %v", err)
	}
	prometheus.Unregister(newDocumentCount(pool, nil, time.Hour))
}

// TestMonitoringConfigUsesServedMetrics keeps infra/prometheus-alerts.yml and the
// Grafana dashboards on series the API registers, so a rule or panel cannot
// watch a metric that never exists.
func TestMonitoringConfigUsesServedMetrics(t *testing.T) {
	served := map[string]bool{}
	descriptors := make(chan *prometheus.Desc, 16)
	for _, collector := range []prometheus.Collector{HTTPRequestsTotal, HTTPRequestDuration, WebSocketConnections, WebSocketRooms, AIRequestsTotal, ExportJobsTotal, newDocumentCount(nil, nil, time.Minute), newValkeyMemory(nil, nil)} {
		collector.Describe(descriptors)
	}
	close(descriptors)
	fqName := regexp.MustCompile(`fqName: "([^"]+)"`)
	for descriptor := range descriptors {
		served[fqName.FindStringSubmatch(descriptor.String())[1]] = true
	}
	files, err := filepath.Glob("../../../../infra/grafana/dashboards/*.json")
	if err != nil || len(files) == 0 {
		t.Fatalf("dashboards not found: %v", err)
	}
	files = append(files, "../../../../infra/prometheus-alerts.yml")
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		for _, name := range regexp.MustCompile(`gotipe_[a-z_]+`).FindAllString(string(data), -1) {
			base := name
			for _, suffix := range []string{"_bucket", "_sum", "_count"} {
				if !served[base] {
					base = strings.TrimSuffix(base, suffix)
				}
			}
			if !served[base] {
				t.Errorf("%s uses %s, which the API does not serve", filepath.Base(file), name)
			}
		}
	}
}

func TestValkeyMemoryIsReadAtScrapeAndOmittedOnFailure(t *testing.T) {
	var failure error
	reads := 0
	var logs bytes.Buffer
	registry := prometheus.NewRegistry()
	registry.MustRegister(newValkeyMemory(func(ctx context.Context) (storage.ValkeyMemory, error) {
		reads++
		if _, ok := ctx.Deadline(); !ok {
			t.Fatal("INFO without a deadline")
		}
		return storage.ValkeyMemory{Used: 900 << 20, Max: 1 << 30}, failure
	}, slog.New(slog.NewTextHandler(&logs, nil))))
	used, usedFound := sample(t, registry, "gotipe_valkey_used_memory_bytes", nil)
	limit, limitFound := sample(t, registry, "gotipe_valkey_maxmemory_bytes", nil)
	// Each Gather is a scrape, and each scrape asks Valkey again.
	if !usedFound || !limitFound || used != 900<<20 || limit != 1<<30 || reads != 2 {
		t.Fatalf("used %v %v, max %v %v, reads %d", used, usedFound, limit, limitFound, reads)
	}
	failure = errors.New("connection refused")
	if _, found := sample(t, registry, "gotipe_valkey_used_memory_bytes", nil); found {
		t.Fatal("reported memory without a fresh INFO")
	}
	if !strings.Contains(logs.String(), "connection refused") {
		t.Fatalf("failure not logged: %s", logs.String())
	}
}
