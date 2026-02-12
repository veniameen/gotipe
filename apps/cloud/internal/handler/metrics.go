package handler

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	HTTPRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gotipe_http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "path", "status"},
	)

	HTTPRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "gotipe_http_request_duration_seconds",
			Help:    "HTTP request duration in seconds",
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
			Help: "Total number of AI proxy requests",
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

	DocumentsTotal = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "gotipe_documents_total",
			Help: "Total number of documents",
		},
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
		DocumentsTotal,
	)
}

func MetricsHandler() http.Handler {
	return promhttp.Handler()
}
