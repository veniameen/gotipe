package handler

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gotipe/cloud/internal/storage"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	HTTPRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gotipe_http_requests_total",
			Help: "REST requests by method, route pattern and status",
		},
		[]string{"method", "path", "status"},
	)

	HTTPRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "gotipe_http_request_duration_seconds",
			Help:    "REST request duration in seconds by method and route pattern",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)

	WebSocketConnections = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "gotipe_websocket_connections",
			Help: "Current number of active WebSocket connections",
		},
	)

	WebSocketRooms = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "gotipe_websocket_rooms",
			Help: "Current number of active sync rooms",
		},
	)

	AIRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gotipe_ai_requests_total",
			Help: "AI provider calls by provider, model and status (success or error)",
		},
		[]string{"provider", "model", "status"},
	)

	ExportJobsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gotipe_export_jobs_total",
			Help: "Total number of export jobs",
		},
		[]string{"format", "status"},
	)
)

func init() {
	prometheus.MustRegister(
		HTTPRequestsTotal,
		HTTPRequestDuration,
		WebSocketConnections,
		WebSocketRooms,
		AIRequestsTotal,
		ExportJobsTotal,
	)
}

func MetricsHandler() http.Handler {
	return promhttp.Handler()
}

// HTTPMetrics records finished REST requests for middleware.MetricsMiddleware.
type HTTPMetrics struct{}

func (HTTPMetrics) ObserveRequest(method, route string, status int, elapsed time.Duration) {
	HTTPRequestsTotal.WithLabelValues(method, route, strconv.Itoa(status)).Inc()
	HTTPRequestDuration.WithLabelValues(method, route).Observe(elapsed.Seconds())
}

// observeAIRequest counts one provider call. Label values stay bounded although
// requests name them: an unknown provider is "other", and a failed call's model is
// "unknown" because only the provider's acceptance shows that a model name is real.
func observeAIRequest(provider, model string, err error) {
	switch provider {
	case "openai", "anthropic", "google":
	default:
		provider = "other"
	}
	status := "success"
	if err != nil {
		status, model = "error", "unknown"
	}
	AIRequestsTotal.WithLabelValues(provider, model, status).Inc()
}

// documentCount reports gotipe_documents_total from PostgreSQL when Prometheus
// scrapes, counting at most once per interval. A failed count leaves the series out
// of the scrape instead of repeating an old value.
type documentCount struct {
	db       storage.Database
	log      *slog.Logger
	desc     *prometheus.Desc
	interval time.Duration

	mu      sync.Mutex
	value   float64
	counted time.Time
}

// RegisterDocumentCount adds gotipe_documents_total to the default registry.
func RegisterDocumentCount(db storage.Database, log *slog.Logger) error {
	return prometheus.Register(newDocumentCount(db, log, time.Minute))
}

func newDocumentCount(db storage.Database, log *slog.Logger, interval time.Duration) *documentCount {
	return &documentCount{
		db: db, log: log, interval: interval,
		desc: prometheus.NewDesc("gotipe_documents_total", "Documents stored, counted at most once a minute", nil, nil),
	}
}

func (c *documentCount) Describe(ch chan<- *prometheus.Desc) { ch <- c.desc }

func (c *documentCount) Collect(ch chan<- prometheus.Metric) {
	if value, ok := c.current(); ok {
		ch <- prometheus.MustNewConstMetric(c.desc, prometheus.GaugeValue, value)
	}
}

func (c *documentCount) current() (float64, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.counted.IsZero() && time.Since(c.counted) < c.interval {
		return c.value, true
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	var count int64
	if err := c.db.QueryRow(ctx, `SELECT count(*) FROM documents`).Scan(&count); err != nil {
		c.log.Warn("document count for metrics failed", "error", err)
		return 0, false
	}
	c.value, c.counted = float64(count), time.Now()
	return c.value, true
}

// valkeyMemory exports Valkey's used_memory and maxmemory at scrape time. Valkey
// runs with noeviction, so at maxmemory it refuses writes and most API requests
// answer 503; these gauges let an alert fire first. A failed INFO leaves both
// series out of the scrape.
type valkeyMemory struct {
	read  func(context.Context) (storage.ValkeyMemory, error)
	log   *slog.Logger
	used  *prometheus.Desc
	limit *prometheus.Desc
}

// RegisterValkeyMemory adds the Valkey memory gauges to the default registry.
func RegisterValkeyMemory(read func(context.Context) (storage.ValkeyMemory, error), log *slog.Logger) error {
	return prometheus.Register(newValkeyMemory(read, log))
}

func newValkeyMemory(read func(context.Context) (storage.ValkeyMemory, error), log *slog.Logger) *valkeyMemory {
	return &valkeyMemory{
		read: read, log: log,
		used:  prometheus.NewDesc("gotipe_valkey_used_memory_bytes", "Memory used by Valkey (INFO memory used_memory)", nil, nil),
		limit: prometheus.NewDesc("gotipe_valkey_maxmemory_bytes", "Valkey maxmemory; 0 means no limit (INFO memory maxmemory)", nil, nil),
	}
}

func (c *valkeyMemory) Describe(ch chan<- *prometheus.Desc) {
	ch <- c.used
	ch <- c.limit
}

func (c *valkeyMemory) Collect(ch chan<- prometheus.Metric) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	memory, err := c.read(ctx)
	if err != nil {
		c.log.Warn("valkey memory for metrics failed", "error", err)
		return
	}
	ch <- prometheus.MustNewConstMetric(c.used, prometheus.GaugeValue, float64(memory.Used))
	ch <- prometheus.MustNewConstMetric(c.limit, prometheus.GaugeValue, float64(memory.Max))
}
