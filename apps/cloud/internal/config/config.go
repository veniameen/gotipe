package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	// Server
	ListenAddr     string
	SyncListenAddr string
	MetricsAddr    string
	Environment    string // "production" | "development"

	// PostgreSQL
	DatabaseURL string
	DBMaxConns  int32
	DBIdleConns int32

	// Valkey
	ValkeyURL      string
	ValkeyPassword string
	ValkeyMaxConns int

	// R2 / S3
	R2AccountID   string
	R2AccessKeyID string
	R2SecretKey   string
	R2Bucket      string
	R2CDNUrl      string
	S3Endpoint    string // MinIO for dev
	S3UsePathStyle bool

	// Auth
	JWTPrivateKeyPEM string // EC P-256 private key PEM
	JWTPublicKeyPEM  string // EC P-256 public key PEM
	JWTIssuer        string
	JWTAudience      string
	JWTExpiry        time.Duration

	// OAuth
	OAuthGitHubClientID     string
	OAuthGitHubClientSecret string
	OAuthGoogleClientID     string
	OAuthGoogleClientSecret string

	// AI
	OpenAIAPIKey      string
	AnthropicAPIKey   string
	GoogleAIAPIKey    string
	AIDefaultProvider string
	AIDefaultModel    string
	AICacheTTL        time.Duration
	AIMaxTokens       int

	// Export
	ExportWorkers      int
	ExportPollInterval time.Duration
	ExportMaxDocSize   int64
	ExportR2Prefix     string

	// Rate Limiting
	RateLimitAPI string // "100/min"
	RateLimitWS  string // "1000/min"
	RateLimitAI  string // "60/min"

	// Stripe
	StripeSecretKey       string
	StripeWebhookSecret   string
	StripePriceStarterID  string
	StripePriceProID      string
	StripePriceBusinessID string

	// Monitoring
	PrometheusEnabled bool
	LogLevel          string // "debug", "info", "warn", "error"
	LogFormat         string // "json", "text"
}

func Load() (*Config, error) {
	c := &Config{
		ListenAddr:     envOr("LISTEN_ADDR", ":8080"),
		SyncListenAddr: envOr("SYNC_LISTEN_ADDR", ":8081"),
		MetricsAddr:    envOr("METRICS_LISTEN_ADDR", ":9090"),
		Environment:    envOr("ENVIRONMENT", "development"),

		DatabaseURL: envRequired("DATABASE_URL"),
		DBMaxConns:  int32(envInt("DATABASE_MAX_CONNS", 50)),
		DBIdleConns: int32(envInt("DATABASE_IDLE_CONNS", 10)),

		ValkeyURL:      envOr("VALKEY_URL", "redis://localhost:6379/0"),
		ValkeyPassword: os.Getenv("VALKEY_PASSWORD"),
		ValkeyMaxConns: envInt("VALKEY_MAX_CONNS", 20),

		R2AccountID:    os.Getenv("R2_ACCOUNT_ID"),
		R2AccessKeyID:  os.Getenv("R2_ACCESS_KEY_ID"),
		R2SecretKey:    os.Getenv("R2_SECRET_ACCESS_KEY"),
		R2Bucket:       envOr("R2_BUCKET", "gotipe-data"),
		R2CDNUrl:       os.Getenv("R2_CDN_URL"),
		S3Endpoint:     os.Getenv("S3_ENDPOINT"),
		S3UsePathStyle: envBool("S3_USE_PATH_STYLE", false),

		JWTPrivateKeyPEM: os.Getenv("JWT_PRIVATE_KEY"),
		JWTPublicKeyPEM:  os.Getenv("JWT_PUBLIC_KEY"),
		JWTIssuer:        envOr("JWT_ISSUER", "gotipe"),
		JWTAudience:      envOr("JWT_AUDIENCE", "gotipe-cloud"),
		JWTExpiry:        envDuration("JWT_EXPIRY", 1*time.Hour),

		OAuthGitHubClientID:     os.Getenv("OAUTH_GITHUB_CLIENT_ID"),
		OAuthGitHubClientSecret: os.Getenv("OAUTH_GITHUB_CLIENT_SECRET"),
		OAuthGoogleClientID:     os.Getenv("OAUTH_GOOGLE_CLIENT_ID"),
		OAuthGoogleClientSecret: os.Getenv("OAUTH_GOOGLE_CLIENT_SECRET"),

		OpenAIAPIKey:      os.Getenv("OPENAI_API_KEY"),
		AnthropicAPIKey:   os.Getenv("ANTHROPIC_API_KEY"),
		GoogleAIAPIKey:    os.Getenv("GOOGLE_AI_API_KEY"),
		AIDefaultProvider: envOr("AI_DEFAULT_PROVIDER", "openai"),
		AIDefaultModel:    envOr("AI_DEFAULT_MODEL", "gpt-4o-mini"),
		AICacheTTL:        envDuration("AI_CACHE_TTL", 5*time.Minute),
		AIMaxTokens:       envInt("AI_MAX_TOKENS", 4096),

		ExportWorkers:      envInt("EXPORT_WORKERS", 4),
		ExportPollInterval: envDuration("EXPORT_POLL_INTERVAL", 1*time.Second),
		ExportMaxDocSize:   int64(envInt("EXPORT_MAX_DOCUMENT_SIZE", 10*1024*1024)),
		ExportR2Prefix:     envOr("EXPORT_R2_PREFIX", "exports/"),

		RateLimitAPI: envOr("RATE_LIMIT_API", "100/min"),
		RateLimitWS:  envOr("RATE_LIMIT_WS", "1000/min"),
		RateLimitAI:  envOr("RATE_LIMIT_AI", "60/min"),

		StripeSecretKey:       os.Getenv("STRIPE_SECRET_KEY"),
		StripeWebhookSecret:   os.Getenv("STRIPE_WEBHOOK_SECRET"),
		StripePriceStarterID:  os.Getenv("STRIPE_PRICE_STARTER_ID"),
		StripePriceProID:      os.Getenv("STRIPE_PRICE_PRO_ID"),
		StripePriceBusinessID: os.Getenv("STRIPE_PRICE_BUSINESS_ID"),

		PrometheusEnabled: envBool("PROMETHEUS_ENABLED", true),
		LogLevel:          envOr("LOG_LEVEL", "info"),
		LogFormat:         envOr("LOG_FORMAT", "json"),
	}
	return c, nil
}

func (c *Config) IsProduction() bool {
	return c.Environment == "production"
}

// ParseRateLimit parses "100/min" -> (100, time.Minute)
func ParseRateLimit(s string) (int, time.Duration, error) {
	parts := strings.SplitN(s, "/", 2)
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid rate limit format: %s", s)
	}
	limit, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, fmt.Errorf("invalid rate limit number: %s", parts[0])
	}
	var window time.Duration
	switch parts[1] {
	case "s", "sec":
		window = time.Second
	case "min":
		window = time.Minute
	case "h", "hour":
		window = time.Hour
	default:
		return 0, 0, fmt.Errorf("invalid rate limit window: %s", parts[1])
	}
	return limit, window, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envRequired(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required env var %s is not set", key))
	}
	return v
}

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func envBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

func envDuration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	if n, err := strconv.Atoi(v); err == nil {
		return time.Duration(n) * time.Second
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}
