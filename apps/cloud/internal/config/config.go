package config

import (
	"fmt"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	// Server
	ListenAddr         string
	SyncListenAddr     string
	MetricsAddr        string
	Environment        string // "production" | "development"
	SyncAllowedOrigins []string
	HTTPAllowedOrigins []string
	// TrustedProxies are reverse proxies whose X-Forwarded-For / X-Real-IP name the client.
	TrustedProxies []netip.Prefix

	// PostgreSQL
	DatabaseURL string
	DBMaxConns  int32
	DBIdleConns int32

	// Valkey
	ValkeyURL      string
	ValkeyPassword string

	// R2 / S3
	R2AccountID    string
	R2AccessKeyID  string
	R2SecretKey    string
	R2Bucket       string
	S3Endpoint     string // MinIO or another S3 API instead of R2
	S3UsePathStyle bool

	// Auth
	JWTPrivateKeyPEM string // EC P-256 private key PEM
	JWTPublicKeyPEM  string // EC P-256 public key PEM
	JWTIssuer        string
	JWTAudience      string
	JWTExpiry        time.Duration

	// AI
	OpenAIAPIKey      string
	AnthropicAPIKey   string
	GoogleAIAPIKey    string
	AIDefaultProvider string
	AIDefaultModel    string
	AIMaxTokens       int

	// Export
	ExportCommand      string // converter binary; empty means gotipe-convert on PATH
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

// Load reads the configuration from the process environment.
func Load() (*Config, error) {
	return LoadFrom(os.LookupEnv)
}

// LoadFrom reads every variable the API understands through lookup, which reports
// whether a variable is set. Nothing else in the API reads configuration, so a test
// can prove that infra/.env.example names only variables that take effect.
func LoadFrom(lookup func(string) (string, bool)) (*Config, error) {
	env := &environment{lookup: lookup}
	c := &Config{
		ListenAddr:         env.text("LISTEN_ADDR", ":8080"),
		SyncListenAddr:     env.text("SYNC_LISTEN_ADDR", ":8081"),
		MetricsAddr:        env.text("METRICS_LISTEN_ADDR", ":9090"),
		Environment:        env.text("ENVIRONMENT", "development"),
		SyncAllowedOrigins: env.list("SYNC_ALLOWED_ORIGINS"),
		TrustedProxies:     env.prefixes("TRUSTED_PROXIES"),

		DatabaseURL: env.text("DATABASE_URL", ""),
		DBMaxConns:  int32(env.integer("DATABASE_MAX_CONNS", 50)),
		DBIdleConns: int32(env.integer("DATABASE_IDLE_CONNS", 10)),

		ValkeyURL:      env.text("VALKEY_URL", "redis://localhost:6379/0"),
		ValkeyPassword: env.text("VALKEY_PASSWORD", ""),

		R2AccountID:    env.text("R2_ACCOUNT_ID", ""),
		R2AccessKeyID:  env.text("R2_ACCESS_KEY_ID", ""),
		R2SecretKey:    env.text("R2_SECRET_ACCESS_KEY", ""),
		R2Bucket:       env.text("R2_BUCKET", "gotipe-data"),
		S3Endpoint:     env.text("S3_ENDPOINT", ""),
		S3UsePathStyle: env.boolean("S3_USE_PATH_STYLE", false),

		JWTPrivateKeyPEM: env.text("JWT_PRIVATE_KEY", ""),
		JWTPublicKeyPEM:  env.text("JWT_PUBLIC_KEY", ""),
		JWTIssuer:        env.text("JWT_ISSUER", "gotipe"),
		JWTAudience:      env.text("JWT_AUDIENCE", "gotipe-cloud"),
		JWTExpiry:        env.duration("JWT_EXPIRY", 1*time.Hour),

		OpenAIAPIKey:      env.text("OPENAI_API_KEY", ""),
		AnthropicAPIKey:   env.text("ANTHROPIC_API_KEY", ""),
		GoogleAIAPIKey:    env.text("GOOGLE_AI_API_KEY", ""),
		AIDefaultProvider: env.text("AI_DEFAULT_PROVIDER", "openai"),
		AIDefaultModel:    env.text("AI_DEFAULT_MODEL", "gpt-4o-mini"),
		AIMaxTokens:       env.integer("AI_MAX_TOKENS", 4096),

		ExportCommand:      env.text("GOTIPE_EXPORT_COMMAND", ""),
		ExportWorkers:      env.integer("EXPORT_WORKERS", 4),
		ExportPollInterval: env.duration("EXPORT_POLL_INTERVAL", 1*time.Second),
		ExportMaxDocSize:   int64(env.integer("EXPORT_MAX_DOCUMENT_SIZE", 10*1024*1024)),
		ExportR2Prefix:     env.text("EXPORT_R2_PREFIX", "exports/"),

		RateLimitAPI: env.text("RATE_LIMIT_API", "100/min"),
		RateLimitWS:  env.text("RATE_LIMIT_WS", "1000/min"),
		RateLimitAI:  env.text("RATE_LIMIT_AI", "60/min"),

		StripeSecretKey:       env.text("STRIPE_SECRET_KEY", ""),
		StripeWebhookSecret:   env.text("STRIPE_WEBHOOK_SECRET", ""),
		StripePriceStarterID:  env.text("STRIPE_PRICE_STARTER_ID", ""),
		StripePriceProID:      env.text("STRIPE_PRICE_PRO_ID", ""),
		StripePriceBusinessID: env.text("STRIPE_PRICE_BUSINESS_ID", ""),

		PrometheusEnabled: env.boolean("PROMETHEUS_ENABLED", true),
		LogLevel:          env.text("LOG_LEVEL", "info"),
		LogFormat:         env.text("LOG_FORMAT", "json"),
	}
	origins, set := env.lookup("HTTP_ALLOWED_ORIGINS")
	c.HTTPAllowedOrigins = httpOrigins(origins, set, c.Environment)
	if env.err != nil {
		return nil, env.err
	}
	if err := c.validate(); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *Config) validate() error {
	if err := validateOrigins("HTTP_ALLOWED_ORIGINS", c.HTTPAllowedOrigins); err != nil {
		return err
	}
	if err := validateOrigins("SYNC_ALLOWED_ORIGINS", c.SyncAllowedOrigins); err != nil {
		return err
	}
	if c.DatabaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	if c.JWTPrivateKeyPEM == "" || c.JWTPublicKeyPEM == "" {
		return fmt.Errorf("JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required (PEM text, not file paths)")
	}
	if c.Environment != "development" && c.Environment != "production" {
		return fmt.Errorf("ENVIRONMENT must be development or production")
	}
	if c.DBMaxConns < 1 || c.DBIdleConns < 0 || c.DBIdleConns > c.DBMaxConns {
		return fmt.Errorf("invalid database connection limits")
	}
	if c.ExportMaxDocSize <= 0 || c.ExportMaxDocSize > 64<<20 || c.ExportWorkers < 1 || c.ExportWorkers > 16 || c.AIMaxTokens < 1 {
		return fmt.Errorf("invalid export or AI resource limits")
	}
	for _, value := range []string{c.RateLimitAPI, c.RateLimitAI, c.RateLimitWS} {
		if _, _, err := ParseRateLimit(value); err != nil {
			return err
		}
	}
	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return fmt.Errorf("LOG_LEVEL must be debug, info, warn or error")
	}
	if c.LogFormat != "json" && c.LogFormat != "text" {
		return fmt.Errorf("LOG_FORMAT must be json or text")
	}
	return nil
}

func splitValues(value string) []string {
	var values []string
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			values = append(values, item)
		}
	}
	return values
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
	if err != nil || limit <= 0 {
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
