# GoTipe — Промт для реализации Фазы 3: Go Cloud Server

## Контекст

Ты реализуешь GoTipe Cloud — managed backend для GoTipe editor: REST API, WebSocket collaboration sync, AI proxy, document export, billing, analytics. Go 1.23, Chi v5 router, PostgreSQL (pgx), Valkey (Redis-compatible), Cloudflare R2 (S3-compatible).

Фазы 1 (Rust crates) и 2 (TypeScript packages) уже реализованы. Фаза 3 = Go Cloud server в `apps/cloud/`. Каждый файл должен быть **полностью рабочим** — компилироваться, проходить тесты, содержать полные реализации. Не заглушки, не TODO, не "implement later".

Проект имеет 20 дизайн-документов в `docs/` с полными reference-реализациями. Ключевые для этой фазы:
- `docs/10-cloud.md` — архитектура Cloud, Docker Compose, deploy scripts, env vars, полный Go код
- `docs/09-sdk-and-api.md` — REST API типы, endpoint сигнатуры
- `docs/02-collaboration.md` — CRDT sync protocol, binary message format, awareness
- `docs/14-security-privacy.md` — auth middleware, CRDT security, CSP headers
- `docs/16-comments-versioning.md` — comments/versions API, RBAC permissions

## Обязательные правила

1. **Chi v5 router:** НЕ net/http.DefaultServeMux. Используй `github.com/go-chi/chi/v5` с middleware chain (порядок критичен: RequestID → Logger → Recoverer → CORS → Auth → RateLimit → Idempotency)
2. **pgx v5 (НЕ database/sql):** `github.com/jackc/pgx/v5/pgxpool` для connection pool. Parameterized queries ВСЕГДА ($1, $2...). НЕ строить SQL через fmt.Sprintf
3. **pgBouncer transaction mode:** НЕ использовать session-level features (SET LOCAL, prepared statements). Миграции НАПРЯМУЮ к Postgres (минуя pgBouncer)
4. **JWT ES256:** `golang-jwt/jwt/v5`. ECDSA P-256 key pair. НЕ HMAC, НЕ RSA. Blocklist в Valkey DB 1 (noeviction, AOF)
5. **Binary CRDT protocol:** WebSocket sync = binary messages (0x01-0x09), zstd compression для payloads >1KB. НЕ JSON WebSocket
6. **Rate limiting:** Sliding window counter через Valkey Lua script. НЕ fixed window, НЕ in-memory counter
7. **Stripe вызовы ВНЕ DB транзакций:** Никогда не вызывай Stripe API внутри PostgreSQL transaction
8. **Stripe webhook handler ВСЕГДА return 200:** Даже при ошибках обработки. Retry через pending_webhooks table
9. **Error format:** `{"error": {"code": "...", "message": "...", "details": {}}}`. Unified error codes
10. **Logging:** `log/slog` — JSON в production, text в dev. НЕ PII в логах (email, имя, content не логируются)
11. **Graceful shutdown 6 phases:** drain HTTP → stop WebSocket → stop workers → close DB/Valkey → exit
12. **Idempotency keys:** Valkey с TTL 24h, header `Idempotency-Key`. Capture response, return cached
13. **Background workers:** goroutine + context + ticker. НЕ cron jobs. Cleanup 1h, retry 30s, billing daily
14. **Naming:** packages = `snake_case`, types = `PascalCase`, handlers return `http.HandlerFunc`, env vars = `SCREAMING_SNAKE`
15. **Table-driven tests:** `testify` assert/require. Integration tests с `testcontainers` (Postgres + Valkey)

## Структура `apps/cloud/`

```
apps/cloud/
  go.mod
  go.sum
  cmd/
    api/main.go              # REST API + WebSocket sync entrypoint
  internal/
    config/config.go         # Environment configuration
    auth/
      jwt.go                 # JWT ES256 generation & validation
      apikey.go              # API key SHA-256 hash lookup
      middleware.go           # Auth middleware (Bearer → API key path OR JWT path)
      claims.go              # JWT claims struct
    handler/
      documents.go           # CRUD documents
      comments.go            # Comments API
      versions.go            # Versions API
      organizations.go       # Organizations + membership
      permissions.go         # RBAC enforcement
      users.go               # GET /v1/users/me
      apikeys.go             # API keys CRUD
      exports.go             # Export job creation + status
      ai.go                  # AI proxy SSE streaming
      auth.go                # POST /v1/auth/token
      billing.go             # Stripe billing endpoints
      webhooks.go            # Stripe webhook handler
      health.go              # Healthz + Readyz
      metrics.go             # Prometheus metrics
    sync/
      server.go              # WebSocket sync server
      room.go                # Room: clients, broadcast, save scheduling
      client.go              # WebSocket client: read/write pump
      persistence.go         # PersistenceStore interface
    storage/
      postgres.go            # PostgreSQL pgx pool, query helpers
      valkey.go              # Valkey client: cache, rate limits, AI cache, JWT blocklist
      r2.go                  # R2/S3 client: Put, Get, Delete, presigned URLs
    middleware/
      ratelimit.go           # Sliding window Lua script
      idempotency.go         # Idempotency key middleware
      cors.go                # CORS middleware
      csp.go                 # CSP headers
      requestid.go           # X-Request-ID propagation
      logger.go              # Request logging middleware
    worker/
      cleanup.go             # Hourly: orphan exports, compact updates, expired tokens
      retry.go               # 30s: pending webhooks, exponential backoff
      export.go              # Export job processor (poll + execute)
      billing.go             # Daily: usage aggregation, monthly billing summary
    billing/
      stripe.go              # Stripe client wrapper
      plans.go               # Plan definitions + quota enforcement
    ai/
      proxy.go               # AI proxy: route to provider, SSE relay, PII filter
      cache.go               # Semantic cache: cosine >0.95, Valkey, TTL 1h
      providers.go           # OpenAI, Anthropic, Gemini implementations
    audit/
      logger.go              # Structured audit events → audit_log table
    apierror/
      codes.go               # APIError struct + predefined error codes
    logger/
      setup.go               # slog setup: JSON prod / text dev
  migrations/
    001_initial.up.sql
    001_initial.down.sql
    002_comments_versions.up.sql
    002_comments_versions.down.sql
    003_organizations.up.sql
    003_organizations.down.sql
    004_billing.up.sql
    004_billing.down.sql
    005_audit.up.sql
    005_audit.down.sql
  Dockerfile
```

## Порядок реализации

Строго по dependency graph:
```
go.mod → config → logger → apierror → storage (postgres, valkey, r2)
  → auth (jwt, apikey, middleware, claims)
  → middleware (ratelimit, idempotency, cors, csp, requestid, logger)
  → billing (plans, stripe)
  → audit (logger)
  → handler (health, documents, users, apikeys, exports, ai, auth, comments, versions, organizations, permissions, billing, webhooks, metrics)
  → sync (server, room, client, persistence)
  → worker (cleanup, retry, export, billing)
  → cmd/api/main.go
  → migrations (001-005)
  → Dockerfile
```

---

## 3.0 `go.mod`

```go
module github.com/gotipe/cloud

go 1.23

require (
    github.com/go-chi/chi/v5 v5.1.0
    github.com/go-chi/cors v1.2.1
    github.com/gorilla/websocket v1.5.3
    github.com/jackc/pgx/v5 v5.7.2
    github.com/golang-jwt/jwt/v5 v5.2.1
    github.com/valkey-io/valkey-go v1.0.47
    github.com/aws/aws-sdk-go-v2 v1.32.7
    github.com/aws/aws-sdk-go-v2/config v1.28.7
    github.com/aws/aws-sdk-go-v2/service/s3 v1.71.1
    github.com/aws/aws-sdk-go-v2/credentials v1.17.48
    github.com/stripe/stripe-go/v81 v81.1.1
    github.com/prometheus/client_golang v1.20.5
    github.com/google/uuid v1.6.0
    github.com/klauspost/compress v1.17.11
    github.com/stretchr/testify v1.10.0
)
```

---

## 3.1 `internal/config/config.go` — Environment Configuration

```go
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
    ListenAddr       string
    SyncListenAddr   string
    MetricsAddr      string
    Environment      string // "production" | "development"

    // PostgreSQL
    DatabaseURL      string
    DBMaxConns       int32
    DBIdleConns      int32

    // Valkey
    ValkeyURL        string
    ValkeyPassword   string
    ValkeyMaxConns   int

    // R2 / S3
    R2AccountID      string
    R2AccessKeyID    string
    R2SecretKey      string
    R2Bucket         string
    R2CDNUrl         string
    S3Endpoint       string // MinIO for dev
    S3UsePathStyle   bool

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
    ExportWorkers       int
    ExportPollInterval  time.Duration
    ExportMaxDocSize    int64
    ExportR2Prefix      string

    // Rate Limiting
    RateLimitAPI     string // "100/min"
    RateLimitWS      string // "1000/min"
    RateLimitAI      string // "60/min"

    // Stripe
    StripeSecretKey      string
    StripeWebhookSecret  string
    StripePriceStarterID string
    StripePriceProID     string
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
        ValkeyPassword:  os.Getenv("VALKEY_PASSWORD"),
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

// ParseRateLimit parses "100/min" → (100, time.Minute)
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
    // Try as seconds first (e.g. "300")
    if n, err := strconv.Atoi(v); err == nil {
        return time.Duration(n) * time.Second
    }
    // Try as Go duration (e.g. "5m")
    d, err := time.ParseDuration(v)
    if err != nil {
        return fallback
    }
    return d
}
```

---

## 3.2 `internal/logger/setup.go` — Structured Logging

```go
package logger

import (
    "log/slog"
    "os"
)

func Setup(level, format string) *slog.Logger {
    var lvl slog.Level
    switch level {
    case "debug":
        lvl = slog.LevelDebug
    case "warn":
        lvl = slog.LevelWarn
    case "error":
        lvl = slog.LevelError
    default:
        lvl = slog.LevelInfo
    }

    opts := &slog.HandlerOptions{Level: lvl}

    var handler slog.Handler
    if format == "json" {
        handler = slog.NewJSONHandler(os.Stdout, opts)
    } else {
        handler = slog.NewTextHandler(os.Stdout, opts)
    }

    return slog.New(handler)
}
```

---

## 3.3 `internal/apierror/codes.go` — Unified Error Codes

```go
package apierror

import (
    "encoding/json"
    "net/http"
)

type APIError struct {
    Code    string      `json:"code"`
    Message string      `json:"message"`
    Details interface{} `json:"details,omitempty"`
    Status  int         `json:"-"`
}

func (e *APIError) Error() string {
    return e.Message
}

func (e *APIError) WithDetails(details interface{}) *APIError {
    return &APIError{
        Code:    e.Code,
        Message: e.Message,
        Details: details,
        Status:  e.Status,
    }
}

func (e *APIError) WithMessage(msg string) *APIError {
    return &APIError{
        Code:    e.Code,
        Message: msg,
        Details: e.Details,
        Status:  e.Status,
    }
}

// Write writes the error as JSON response
func (e *APIError) Write(w http.ResponseWriter) {
    w.Header().Set("Content-Type", "application/json; charset=utf-8")
    w.WriteHeader(e.Status)
    json.NewEncoder(w).Encode(map[string]interface{}{
        "error": e,
    })
}

// Predefined errors
var (
    ErrInvalidJSON     = &APIError{Code: "INVALID_JSON", Message: "Request body is not valid JSON", Status: 400}
    ErrValidation      = &APIError{Code: "VALIDATION_ERROR", Message: "Request validation failed", Status: 400}
    ErrUnauthorized    = &APIError{Code: "UNAUTHORIZED", Message: "Missing or invalid authentication", Status: 401}
    ErrInvalidAPIKey   = &APIError{Code: "INVALID_API_KEY", Message: "API key is invalid or expired", Status: 401}
    ErrInvalidToken    = &APIError{Code: "INVALID_TOKEN", Message: "JWT token is invalid or expired", Status: 401}
    ErrForbidden       = &APIError{Code: "FORBIDDEN", Message: "Insufficient permissions", Status: 403}
    ErrNotFound        = &APIError{Code: "NOT_FOUND", Message: "Resource not found", Status: 404}
    ErrConflict        = &APIError{Code: "CONFLICT", Message: "Resource already exists", Status: 409}
    ErrQuotaExceeded   = &APIError{Code: "QUOTA_EXCEEDED", Message: "Plan limit reached", Status: 402}
    ErrRateLimited     = &APIError{Code: "RATE_LIMITED", Message: "Too many requests", Status: 429}
    ErrInternal        = &APIError{Code: "INTERNAL_ERROR", Message: "Internal server error", Status: 500}
    ErrServiceDown     = &APIError{Code: "SERVICE_UNAVAILABLE", Message: "Service temporarily unavailable", Status: 503}
)

// WriteJSON helper for success responses
func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
    w.Header().Set("Content-Type", "application/json; charset=utf-8")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(data)
}
```

---

## 3.4 `internal/storage/` — Storage Layer

### `internal/storage/postgres.go`

```go
package storage

import (
    "context"
    "fmt"

    "github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
    Pool *pgxpool.Pool
}

func NewPostgresStore(ctx context.Context, databaseURL string, maxConns, idleConns int32) (*PostgresStore, error) {
    cfg, err := pgxpool.ParseConfig(databaseURL)
    if err != nil {
        return nil, fmt.Errorf("parse database url: %w", err)
    }

    cfg.MaxConns = maxConns
    cfg.MinConns = idleConns

    pool, err := pgxpool.NewWithConfig(ctx, cfg)
    if err != nil {
        return nil, fmt.Errorf("connect to database: %w", err)
    }

    if err := pool.Ping(ctx); err != nil {
        return nil, fmt.Errorf("ping database: %w", err)
    }

    return &PostgresStore{Pool: pool}, nil
}

func (s *PostgresStore) Close() {
    s.Pool.Close()
}

func (s *PostgresStore) Ping(ctx context.Context) error {
    return s.Pool.Ping(ctx)
}
```

Все запросы — через `s.Pool.QueryRow(ctx, sql, $1, $2...)` или `s.Pool.Exec(ctx, sql, $1, $2...)`. НЕ строить SQL строками.

### `internal/storage/valkey.go`

```go
package storage

import (
    "context"
    "time"

    "github.com/valkey-io/valkey-go"
)

type ValkeyStore struct {
    Client valkey.Client
}

func NewValkeyStore(url, password string, maxConns int) (*ValkeyStore, error) {
    opts, err := valkey.ParseURL(url)
    if err != nil {
        return nil, err
    }
    if password != "" {
        opts.Password = password
    }
    client, err := valkey.NewClient(opts)
    if err != nil {
        return nil, err
    }
    return &ValkeyStore{Client: client}, nil
}

func (s *ValkeyStore) Close() {
    s.Client.Close()
}

func (s *ValkeyStore) Ping(ctx context.Context) error {
    return s.Client.Do(ctx, s.Client.B().Ping().Build()).Error()
}

// Set with TTL
func (s *ValkeyStore) Set(ctx context.Context, key string, value []byte, ttl time.Duration) error {
    return s.Client.Do(ctx, s.Client.B().Set().Key(key).Value(string(value)).Ex(ttl).Build()).Error()
}

// Get returns value or nil
func (s *ValkeyStore) Get(ctx context.Context, key string) ([]byte, error) {
    result, err := s.Client.Do(ctx, s.Client.B().Get().Key(key).Build()).AsBytes()
    if err != nil {
        if valkey.IsValkeyNil(err) {
            return nil, nil
        }
        return nil, err
    }
    return result, nil
}

// Delete key
func (s *ValkeyStore) Del(ctx context.Context, key string) error {
    return s.Client.Do(ctx, s.Client.B().Del().Key(key).Build()).Error()
}

// EvalSHA for Lua scripts (rate limiting)
func (s *ValkeyStore) EvalSHA(ctx context.Context, sha string, keys []string, args ...interface{}) (int64, error) {
    cmd := s.Client.B().Evalsha().Sha1(sha).Numkeys(int64(len(keys)))
    for _, k := range keys {
        cmd = cmd.Key(k)
    }
    // Build args as strings
    strArgs := make([]string, len(args))
    for i, a := range args {
        strArgs[i] = fmt.Sprintf("%v", a)
    }
    for _, a := range strArgs {
        cmd = cmd.Arg(a)
    }
    return s.Client.Do(ctx, cmd.Build()).AsInt64()
}

// ScriptLoad loads Lua script, returns SHA
func (s *ValkeyStore) ScriptLoad(ctx context.Context, script string) (string, error) {
    return s.Client.Do(ctx, s.Client.B().ScriptLoad().Script(script).Build()).ToString()
}

// JWT blocklist operations (DB 1, noeviction)
// Use separate client or SELECT DB 1 for blocklist
func (s *ValkeyStore) BlocklistAdd(ctx context.Context, jti string, ttl time.Duration) error {
    key := "jwt:blocklist:" + jti
    return s.Set(ctx, key, []byte("1"), ttl)
}

func (s *ValkeyStore) BlocklistCheck(ctx context.Context, jti string) (bool, error) {
    val, err := s.Get(ctx, "jwt:blocklist:"+jti)
    if err != nil {
        return false, err
    }
    return val != nil, nil
}
```

### `internal/storage/r2.go`

```go
package storage

import (
    "bytes"
    "context"
    "fmt"
    "io"
    "time"

    "github.com/aws/aws-sdk-go-v2/aws"
    awsconfig "github.com/aws/aws-sdk-go-v2/config"
    "github.com/aws/aws-sdk-go-v2/credentials"
    "github.com/aws/aws-sdk-go-v2/service/s3"
)

type R2Store struct {
    client *s3.Client
    bucket string
    cdnURL string
}

func NewR2Store(ctx context.Context, accountID, accessKeyID, secretKey, bucket, cdnURL, endpoint string, usePathStyle bool) (*R2Store, error) {
    // Determine endpoint
    var endpointURL string
    if endpoint != "" {
        endpointURL = endpoint // MinIO for dev
    } else if accountID != "" {
        endpointURL = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID)
    } else {
        return nil, fmt.Errorf("either S3_ENDPOINT or R2_ACCOUNT_ID must be set")
    }

    cfg, err := awsconfig.LoadDefaultConfig(ctx,
        awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKeyID, secretKey, "")),
        awsconfig.WithRegion("auto"),
    )
    if err != nil {
        return nil, fmt.Errorf("load aws config: %w", err)
    }

    client := s3.NewFromConfig(cfg, func(o *s3.Options) {
        o.BaseEndpoint = aws.String(endpointURL)
        o.UsePathStyle = usePathStyle
    })

    return &R2Store{
        client: client,
        bucket: bucket,
        cdnURL: cdnURL,
    }, nil
}

func (s *R2Store) Put(ctx context.Context, key string, data []byte) error {
    _, err := s.client.PutObject(ctx, &s3.PutObjectInput{
        Bucket: aws.String(s.bucket),
        Key:    aws.String(key),
        Body:   bytes.NewReader(data),
    })
    return err
}

func (s *R2Store) Get(ctx context.Context, key string) ([]byte, error) {
    out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
        Bucket: aws.String(s.bucket),
        Key:    aws.String(key),
    })
    if err != nil {
        return nil, err
    }
    defer out.Body.Close()
    return io.ReadAll(out.Body)
}

func (s *R2Store) Delete(ctx context.Context, key string) error {
    _, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
        Bucket: aws.String(s.bucket),
        Key:    aws.String(key),
    })
    return err
}

func (s *R2Store) HeadBucket(ctx context.Context) error {
    _, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{
        Bucket: aws.String(s.bucket),
    })
    return err
}

// PresignedURL generates a presigned GET URL (for export downloads)
func (s *R2Store) PresignedURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
    presigner := s3.NewPresignClient(s.client)
    req, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
        Bucket: aws.String(s.bucket),
        Key:    aws.String(key),
    }, s3.WithPresignExpires(expiry))
    if err != nil {
        return "", err
    }
    return req.URL, nil
}
```

---

## 3.5 `internal/auth/` — Authentication

### `internal/auth/claims.go`

```go
package auth

import (
    "github.com/golang-jwt/jwt/v5"
)

type Claims struct {
    jwt.RegisteredClaims
    UserID      string   `json:"user_id"`
    Plan        string   `json:"plan"`
    Scopes      []string `json:"scopes"`
    DocumentIDs []string `json:"document_ids,omitempty"`
    OrgID       string   `json:"org_id,omitempty"`
}

// UserContext is injected into request context after auth
type UserContext struct {
    UserID string
    Plan   string
    Scopes []string
    OrgID  string
}

func (u *UserContext) HasScope(scope string) bool {
    for _, s := range u.Scopes {
        if s == scope || s == "admin" {
            return true
        }
    }
    return false
}
```

### `internal/auth/jwt.go`

```go
package auth

import (
    "crypto/ecdsa"
    "crypto/x509"
    "encoding/pem"
    "fmt"
    "time"

    "github.com/golang-jwt/jwt/v5"
    "github.com/google/uuid"
)

type JWTService struct {
    privateKey *ecdsa.PrivateKey
    publicKey  *ecdsa.PublicKey
    issuer     string
    audience   string
    expiry     time.Duration
}

func NewJWTService(privateKeyPEM, publicKeyPEM, issuer, audience string, expiry time.Duration) (*JWTService, error) {
    // Parse private key
    block, _ := pem.Decode([]byte(privateKeyPEM))
    if block == nil {
        return nil, fmt.Errorf("failed to decode private key PEM")
    }
    privKey, err := x509.ParseECPrivateKey(block.Bytes)
    if err != nil {
        return nil, fmt.Errorf("parse EC private key: %w", err)
    }

    // Parse public key
    block, _ = pem.Decode([]byte(publicKeyPEM))
    if block == nil {
        return nil, fmt.Errorf("failed to decode public key PEM")
    }
    pubKeyIface, err := x509.ParsePKIXPublicKey(block.Bytes)
    if err != nil {
        return nil, fmt.Errorf("parse EC public key: %w", err)
    }
    pubKey, ok := pubKeyIface.(*ecdsa.PublicKey)
    if !ok {
        return nil, fmt.Errorf("public key is not ECDSA")
    }

    return &JWTService{
        privateKey: privKey,
        publicKey:  pubKey,
        issuer:     issuer,
        audience:   audience,
        expiry:     expiry,
    }, nil
}

func (s *JWTService) Generate(userID, plan string, scopes, documentIDs []string) (string, time.Time, error) {
    now := time.Now()
    expiresAt := now.Add(s.expiry)
    jti := uuid.New().String()

    claims := &Claims{
        RegisteredClaims: jwt.RegisteredClaims{
            Issuer:    s.issuer,
            Audience:  jwt.ClaimStrings{s.audience},
            Subject:   userID,
            IssuedAt:  jwt.NewNumericDate(now),
            ExpiresAt: jwt.NewNumericDate(expiresAt),
            ID:        jti,
        },
        UserID:      userID,
        Plan:        plan,
        Scopes:      scopes,
        DocumentIDs: documentIDs,
    }

    token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
    signed, err := token.SignedString(s.privateKey)
    if err != nil {
        return "", time.Time{}, fmt.Errorf("sign token: %w", err)
    }

    return signed, expiresAt, nil
}

func (s *JWTService) Validate(tokenString string) (*Claims, error) {
    token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
        if _, ok := t.Method.(*jwt.SigningMethodECDSA); !ok {
            return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
        }
        return s.publicKey, nil
    },
        jwt.WithIssuer(s.issuer),
        jwt.WithAudience(s.audience),
        jwt.WithExpirationRequired(),
    )
    if err != nil {
        return nil, fmt.Errorf("parse token: %w", err)
    }

    claims, ok := token.Claims.(*Claims)
    if !ok || !token.Valid {
        return nil, fmt.Errorf("invalid token claims")
    }

    return claims, nil
}
```

### `internal/auth/apikey.go`

```go
package auth

import (
    "context"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "strings"

    "github.com/jackc/pgx/v5/pgxpool"
)

type APIKeyService struct {
    pool *pgxpool.Pool
}

func NewAPIKeyService(pool *pgxpool.Pool) *APIKeyService {
    return &APIKeyService{pool: pool}
}

// ValidateKey checks API key against DB. Format: gt_live_sk_<32hex> or gt_test_sk_<32hex>
func (s *APIKeyService) ValidateKey(ctx context.Context, key string) (*UserContext, error) {
    if !strings.HasPrefix(key, "gt_") {
        return nil, fmt.Errorf("invalid api key format")
    }

    hash := sha256.Sum256([]byte(key))
    keyHash := hex.EncodeToString(hash[:])

    var userID, plan string
    var scopes []string
    err := s.pool.QueryRow(ctx,
        `SELECT u.id, u.plan, k.scopes
         FROM api_keys k JOIN users u ON k.user_id = u.id
         WHERE k.key_hash = $1 AND (k.expires_at IS NULL OR k.expires_at > now())`,
        keyHash,
    ).Scan(&userID, &plan, &scopes)

    if err != nil {
        return nil, fmt.Errorf("invalid api key")
    }

    // Update last_used_at (fire and forget)
    go func() {
        s.pool.Exec(context.Background(),
            `UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1`, keyHash)
    }()

    return &UserContext{
        UserID: userID,
        Plan:   plan,
        Scopes: scopes,
    }, nil
}

// GenerateKey creates new API key, returns raw key (only shown once) and prefix
func GenerateKey(env string) (rawKey, prefix string) {
    // Generate 32 random hex bytes
    b := make([]byte, 32)
    _, _ = rand.Read(b) // crypto/rand
    hexStr := hex.EncodeToString(b)

    if env == "production" {
        prefix = "gt_live_sk_"
    } else {
        prefix = "gt_test_sk_"
    }
    rawKey = prefix + hexStr
    return rawKey, prefix[:8]
}

// HashKey returns SHA-256 hex hash of API key
func HashKey(key string) string {
    hash := sha256.Sum256([]byte(key))
    return hex.EncodeToString(hash[:])
}
```

### `internal/auth/middleware.go`

```go
package auth

import (
    "context"
    "net/http"
    "strings"

    "github.com/gotipe/cloud/internal/apierror"
    "github.com/gotipe/cloud/internal/storage"
)

type contextKey string

const userContextKey contextKey = "user"

func UserFromContext(ctx context.Context) *UserContext {
    u, _ := ctx.Value(userContextKey).(*UserContext)
    return u
}

func withUser(ctx context.Context, u *UserContext) context.Context {
    return context.WithValue(ctx, userContextKey, u)
}

// AuthMiddleware validates Bearer token (API key or JWT)
func AuthMiddleware(jwtSvc *JWTService, apiKeySvc *APIKeyService, valkey *storage.ValkeyStore) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
            if token == "" {
                apierror.ErrUnauthorized.Write(w)
                return
            }

            // API Key path: starts with "gt_"
            if strings.HasPrefix(token, "gt_") {
                user, err := apiKeySvc.ValidateKey(r.Context(), token)
                if err != nil {
                    apierror.ErrInvalidAPIKey.Write(w)
                    return
                }
                ctx := withUser(r.Context(), user)
                next.ServeHTTP(w, r.WithContext(ctx))
                return
            }

            // JWT path
            claims, err := jwtSvc.Validate(token)
            if err != nil {
                apierror.ErrInvalidToken.Write(w)
                return
            }

            // Check JWT blocklist
            if claims.ID != "" {
                blocked, _ := valkey.BlocklistCheck(r.Context(), claims.ID)
                if blocked {
                    apierror.ErrInvalidToken.WithMessage("Token has been revoked").Write(w)
                    return
                }
            }

            user := &UserContext{
                UserID: claims.UserID,
                Plan:   claims.Plan,
                Scopes: claims.Scopes,
                OrgID:  claims.OrgID,
            }
            ctx := withUser(r.Context(), user)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}

// RequireScope returns middleware that checks for specific scope
func RequireScope(scope string) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            user := UserFromContext(r.Context())
            if user == nil || !user.HasScope(scope) {
                apierror.ErrForbidden.Write(w)
                return
            }
            next.ServeHTTP(w, r.WithContext(r.Context()))
        })
    }
}
```

---

## 3.6 `internal/middleware/` — Middleware Chain

### `internal/middleware/ratelimit.go`

Sliding window Lua script. НЕ fixed window.

```go
package middleware

import (
    "fmt"
    "net/http"
    "time"

    "github.com/gotipe/cloud/internal/apierror"
    "github.com/gotipe/cloud/internal/auth"
    "github.com/gotipe/cloud/internal/storage"
)

// Lua script: sliding window rate limiter
const rateLimitLua = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local window_start = now - window

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

local count = redis.call('ZCARD', key)

if count < limit then
    redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
    redis.call('PEXPIRE', key, window)
    return 1
else
    redis.call('PEXPIRE', key, window)
    return 0
end
`

type RateLimiter struct {
    valkey    *storage.ValkeyStore
    scriptSHA string
    limit     int
    window    time.Duration
}

func NewRateLimiter(valkey *storage.ValkeyStore, limit int, window time.Duration) (*RateLimiter, error) {
    sha, err := valkey.ScriptLoad(context.Background(), rateLimitLua)
    if err != nil {
        return nil, fmt.Errorf("load rate limit script: %w", err)
    }
    return &RateLimiter{
        valkey:    valkey,
        scriptSHA: sha,
        limit:     limit,
        window:    window,
    }, nil
}

func (rl *RateLimiter) Allow(ctx context.Context, key string) bool {
    now := time.Now().UnixMilli()
    result, err := rl.valkey.EvalSHA(ctx, rl.scriptSHA,
        []string{key},
        rl.limit, rl.window.Milliseconds(), now,
    )
    if err != nil {
        // Graceful degradation: if Valkey unavailable, allow request
        return true
    }
    return result == 1
}

func (rl *RateLimiter) Middleware() func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            user := auth.UserFromContext(r.Context())
            if user == nil {
                next.ServeHTTP(w, r)
                return
            }

            key := fmt.Sprintf("rl:api:%s", user.UserID)
            if !rl.Allow(r.Context(), key) {
                w.Header().Set("Retry-After", fmt.Sprintf("%d", int(rl.window.Seconds())))
                apierror.ErrRateLimited.Write(w)
                return
            }

            next.ServeHTTP(w, r)
        })
    }
}
```

### `internal/middleware/idempotency.go`

```go
package middleware

import (
    "bytes"
    "context"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "time"

    "github.com/gotipe/cloud/internal/auth"
    "github.com/gotipe/cloud/internal/storage"
)

type cachedResponse struct {
    Status  int               `json:"status"`
    Headers map[string]string `json:"headers"`
    Body    []byte            `json:"body"`
}

func IdempotencyMiddleware(valkey *storage.ValkeyStore) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // Only mutating methods
            if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
                next.ServeHTTP(w, r)
                return
            }

            key := r.Header.Get("Idempotency-Key")
            if key == "" {
                next.ServeHTTP(w, r)
                return
            }

            user := auth.UserFromContext(r.Context())
            userID := ""
            if user != nil {
                userID = user.UserID
            }

            cacheKey := "idempotency:" + userID + ":" + key

            // Check cached response
            cached, err := valkey.Get(r.Context(), cacheKey)
            if err == nil && cached != nil {
                var resp cachedResponse
                if json.Unmarshal(cached, &resp) == nil {
                    for k, v := range resp.Headers {
                        w.Header().Set(k, v)
                    }
                    w.WriteHeader(resp.Status)
                    w.Write(resp.Body)
                    return
                }
            }

            // Capture response
            rec := httptest.NewRecorder()
            next.ServeHTTP(rec, r)

            // Cache response for 24h
            headers := make(map[string]string)
            for k := range rec.Header() {
                headers[k] = rec.Header().Get(k)
            }
            resp := cachedResponse{
                Status:  rec.Code,
                Headers: headers,
                Body:    rec.Body.Bytes(),
            }
            data, _ := json.Marshal(resp)
            valkey.Set(r.Context(), cacheKey, data, 24*time.Hour)

            // Write actual response
            for k, vals := range rec.Header() {
                for _, v := range vals {
                    w.Header().Add(k, v)
                }
            }
            w.WriteHeader(rec.Code)
            w.Write(rec.Body.Bytes())
        })
    }
}
```

### `internal/middleware/cors.go`

```go
package middleware

import (
    "github.com/go-chi/cors"
)

func CORSMiddleware(allowedOrigins []string) func(http.Handler) http.Handler {
    return cors.Handler(cors.Options{
        AllowedOrigins:   allowedOrigins,
        AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
        AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"},
        ExposedHeaders:   []string{"X-Request-ID", "Retry-After"},
        AllowCredentials: true,
        MaxAge:           300,
    })
}
```

### `internal/middleware/csp.go`

```go
package middleware

import "net/http"

func CSPMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Security-Policy",
            "default-src 'self'; "+
            "script-src 'self' 'wasm-unsafe-eval'; "+
            "style-src 'self' 'unsafe-inline'; "+
            "img-src 'self' data: https:; "+
            "connect-src 'self' wss: https:; "+
            "worker-src 'self' blob:; "+
            "frame-src 'none'; "+
            "object-src 'none'; "+
            "base-uri 'self'")
        w.Header().Set("X-Content-Type-Options", "nosniff")
        w.Header().Set("X-Frame-Options", "DENY")
        w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
        next.ServeHTTP(w, r)
    })
}
```

### `internal/middleware/requestid.go`

```go
package middleware

import (
    "context"
    "net/http"

    "github.com/google/uuid"
)

type reqIDKey struct{}

func RequestIDMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        id := r.Header.Get("X-Request-ID")
        if id == "" {
            id = uuid.New().String()
        }
        w.Header().Set("X-Request-ID", id)
        ctx := context.WithValue(r.Context(), reqIDKey{}, id)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

func RequestIDFromContext(ctx context.Context) string {
    id, _ := ctx.Value(reqIDKey{}).(string)
    return id
}
```

### `internal/middleware/logger.go`

```go
package middleware

import (
    "log/slog"
    "net/http"
    "time"
)

func LoggerMiddleware(log *slog.Logger) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()
            ww := &responseWriter{ResponseWriter: w, statusCode: 200}

            next.ServeHTTP(ww, r)

            log.Info("request",
                "method", r.Method,
                "path", r.URL.Path,
                "status", ww.statusCode,
                "latency_ms", time.Since(start).Milliseconds(),
                "request_id", RequestIDFromContext(r.Context()),
                "remote_addr", r.RemoteAddr,
            )
        })
    }
}

type responseWriter struct {
    http.ResponseWriter
    statusCode int
}

func (w *responseWriter) WriteHeader(code int) {
    w.statusCode = code
    w.ResponseWriter.WriteHeader(code)
}
```

---

## 3.7 `internal/billing/` — Stripe Integration

### `internal/billing/plans.go`

```go
package billing

type Plan struct {
    Name           string
    DocumentLimit  int64
    AIRequestLimit int64 // per month, -1 = unlimited
    ExportLimit    int64 // per month, -1 = unlimited
    MAULimit       int64
}

var Plans = map[string]Plan{
    "free":       {Name: "Free", DocumentLimit: 100, AIRequestLimit: 100, ExportLimit: 10, MAULimit: 10},
    "starter":    {Name: "Starter", DocumentLimit: 1_000, AIRequestLimit: 10_000, ExportLimit: 1_000, MAULimit: 1_000},
    "pro":        {Name: "Pro", DocumentLimit: 10_000, AIRequestLimit: 100_000, ExportLimit: -1, MAULimit: 10_000},
    "business":   {Name: "Business", DocumentLimit: 100_000, AIRequestLimit: 1_000_000, ExportLimit: -1, MAULimit: 100_000},
    "enterprise": {Name: "Enterprise", DocumentLimit: 1_000_000, AIRequestLimit: -1, ExportLimit: -1, MAULimit: -1},
}

func GetPlan(name string) Plan {
    if p, ok := Plans[name]; ok {
        return p
    }
    return Plans["free"]
}

func CheckDocumentQuota(plan string, currentCount int64) bool {
    p := GetPlan(plan)
    return currentCount < p.DocumentLimit
}

func CheckAIQuota(plan string, currentCount int64) bool {
    p := GetPlan(plan)
    if p.AIRequestLimit == -1 {
        return true
    }
    return currentCount < p.AIRequestLimit
}
```

### `internal/billing/stripe.go`

```go
package billing

import (
    "github.com/stripe/stripe-go/v81"
    "github.com/stripe/stripe-go/v81/customer"
    "github.com/stripe/stripe-go/v81/subscription"
    "github.com/stripe/stripe-go/v81/checkout/session"
)

type StripeClient struct {
    secretKey string
}

func NewStripeClient(secretKey string) *StripeClient {
    stripe.Key = secretKey
    return &StripeClient{secretKey: secretKey}
}

// CreateCustomer creates Stripe customer for a user
func (c *StripeClient) CreateCustomer(email, name string) (*stripe.Customer, error) {
    params := &stripe.CustomerParams{
        Email: stripe.String(email),
        Name:  stripe.String(name),
    }
    return customer.New(params)
}

// CreateSubscription creates subscription for a customer
// IMPORTANT: Call OUTSIDE DB transaction
func (c *StripeClient) CreateSubscription(customerID, priceID string) (*stripe.Subscription, error) {
    params := &stripe.SubscriptionParams{
        Customer: stripe.String(customerID),
        Items: []*stripe.SubscriptionItemsParams{
            {Price: stripe.String(priceID)},
        },
    }
    return subscription.New(params)
}

// CancelSubscription cancels at period end
// IMPORTANT: Call OUTSIDE DB transaction
func (c *StripeClient) CancelSubscription(subscriptionID string) (*stripe.Subscription, error) {
    params := &stripe.SubscriptionParams{
        CancelAtPeriodEnd: stripe.Bool(true),
    }
    return subscription.Update(subscriptionID, params)
}

// CreateCheckoutSession creates hosted checkout page
func (c *StripeClient) CreateCheckoutSession(customerID, priceID, successURL, cancelURL string) (*stripe.CheckoutSession, error) {
    params := &stripe.CheckoutSessionParams{
        Customer: stripe.String(customerID),
        Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
        LineItems: []*stripe.CheckoutSessionLineItemParams{
            {
                Price:    stripe.String(priceID),
                Quantity: stripe.Int64(1),
            },
        },
        SuccessURL: stripe.String(successURL),
        CancelURL:  stripe.String(cancelURL),
    }
    return session.New(params)
}
```

---

## 3.8 `internal/audit/logger.go`

```go
package audit

import (
    "context"
    "encoding/json"

    "github.com/jackc/pgx/v5/pgxpool"
)

type AuditLogger struct {
    pool *pgxpool.Pool
}

func NewAuditLogger(pool *pgxpool.Pool) *AuditLogger {
    return &AuditLogger{pool: pool}
}

// Action constants
const (
    ActionDocumentCreate     = "document.create"
    ActionDocumentDelete     = "document.delete"
    ActionDocumentUpdate     = "document.update"
    ActionCommentAdd         = "comment.add"
    ActionCommentResolve     = "comment.resolve"
    ActionCommentDelete      = "comment.delete"
    ActionVersionCreate      = "version.create"
    ActionVersionRestore     = "version.restore"
    ActionPermissionChange   = "permission.change"
    ActionBillingSubscribe   = "billing.subscribe"
    ActionBillingCancel      = "billing.cancel"
    ActionAPIKeyCreate       = "apikey.create"
    ActionAPIKeyDelete       = "apikey.delete"
    ActionExportCreate       = "export.create"
    ActionOrgCreate          = "org.create"
    ActionOrgMemberAdd       = "org.member.add"
    ActionOrgMemberRemove    = "org.member.remove"
)

func (l *AuditLogger) Log(ctx context.Context, userID, action, resourceType, resourceID string, details interface{}) error {
    detailsJSON, _ := json.Marshal(details)

    _, err := l.pool.Exec(ctx,
        `INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        userID, action, resourceType, resourceID, detailsJSON, remoteAddrFromContext(ctx),
    )
    return err
}

func remoteAddrFromContext(ctx context.Context) string {
    // Extract from middleware-injected value or return empty
    if addr, ok := ctx.Value("remote_addr").(string); ok {
        return addr
    }
    return ""
}
```

---

## 3.9 `internal/handler/` — REST API Handlers

### `internal/handler/health.go`

```go
package handler

import (
    "context"
    "net/http"
    "time"

    "github.com/gotipe/cloud/internal/apierror"
    "github.com/gotipe/cloud/internal/storage"
)

func Healthz() http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        apierror.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
    }
}

func Readyz(db *storage.PostgresStore, valkey *storage.ValkeyStore, r2 *storage.R2Store) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
        defer cancel()

        checks := map[string]string{}
        allOK := true

        if err := db.Ping(ctx); err != nil {
            checks["postgres"] = err.Error()
            allOK = false
        } else {
            checks["postgres"] = "ok"
        }

        if err := valkey.Ping(ctx); err != nil {
            checks["valkey"] = err.Error()
            allOK = false
        } else {
            checks["valkey"] = "ok"
        }

        if err := r2.HeadBucket(ctx); err != nil {
            checks["r2"] = err.Error()
            allOK = false
        } else {
            checks["r2"] = "ok"
        }

        status := http.StatusOK
        statusText := "ok"
        if !allOK {
            status = http.StatusServiceUnavailable
            statusText = "degraded"
        }

        apierror.WriteJSON(w, status, map[string]interface{}{
            "status": statusText,
            "checks": checks,
        })
    }
}
```

### `internal/handler/documents.go`

Полная реализация CRUD: CreateDocument (plan limit check → R2 upload → DB insert → audit log → usage log), GetDocument (DB + R2 snapshot → rebuild JSON), ListDocuments (pagination: limit/offset, sort by updated_at desc), DeleteDocument (R2 cleanup → DB delete → audit log).

Request/Response типы:

```go
type CreateDocumentRequest struct {
    ID      string          `json:"id"`
    Title   string          `json:"title"`
    Content json.RawMessage `json:"content"`
}

type DocumentResponse struct {
    ID            string          `json:"id"`
    Title         string          `json:"title"`
    Version       int64           `json:"version"`
    SizeBytes     int64           `json:"size_bytes"`
    Content       json.RawMessage `json:"content,omitempty"`
    Collaborators json.RawMessage `json:"collaborators"`
    SyncURL       string          `json:"sync_url,omitempty"`
    CreatedAt     time.Time       `json:"created_at"`
    UpdatedAt     time.Time       `json:"updated_at"`
}

type ListResponse struct {
    Data  []DocumentResponse `json:"data"`
    Total int64              `json:"total"`
    Limit int                `json:"limit"`
    Offset int               `json:"offset"`
}
```

Key logic in CreateDocument:
1. `auth.UserFromContext(r.Context())` → get user
2. `SELECT COUNT(*) FROM documents WHERE user_id = $1` → check plan limit via `billing.CheckDocumentQuota(user.Plan, count)`
3. Decode request body
4. Store initial content as CRDT snapshot in R2: `r2.Put(ctx, "snapshots/"+req.ID+"/v1", crdtState)`
5. `INSERT INTO documents (id, user_id, title, version, r2_snapshot_key, size_bytes) VALUES ($1, $2, $3, 1, $4, $5)`
6. `audit.Log(ctx, user.UserID, audit.ActionDocumentCreate, "document", req.ID, nil)`
7. Return 201 with `DocumentResponse{SyncURL: "wss://sync.gotipe.com/ws/"+req.ID}`

### `internal/handler/comments.go`

Endpoints:
- `POST /v1/documents/{docID}/comments` — add comment (inline/block/document)
- `GET /v1/documents/{docID}/comments` — list comments (filter: resolved, author)
- `POST /v1/documents/{docID}/comments/{commentID}/replies` — reply to comment
- `POST /v1/documents/{docID}/comments/{commentID}/resolve` — resolve comment
- `DELETE /v1/documents/{docID}/comments/{commentID}` — delete comment

SQL for comments table:
```sql
INSERT INTO comments (id, document_id, anchor_type, anchor_data, author_id, content, parent_id, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
```

Permission check: user must have "commenter" or "editor" role for the document.

### `internal/handler/versions.go`

Endpoints:
- `GET /v1/documents/{docID}/versions` — list versions
- `POST /v1/documents/{docID}/versions` — create named version (snapshot to R2)
- `POST /v1/documents/{docID}/versions/{versionID}/restore` — restore version
- `GET /v1/documents/{docID}/versions/diff?from=&to=` — diff between versions

Version creation: capture current CRDT state vector, store snapshot in R2 via `r2.Put(ctx, "versions/"+docID+"/"+versionID, snapshotData)`, insert into `versions` table.

### `internal/handler/organizations.go`

Endpoints:
- `POST /v1/organizations` — create org
- `GET /v1/organizations` — list user's orgs
- `PUT /v1/organizations/{orgID}` — update org
- `DELETE /v1/organizations/{orgID}` — delete org (owner only)
- `POST /v1/organizations/{orgID}/members` — add member
- `DELETE /v1/organizations/{orgID}/members/{userID}` — remove member
- `PUT /v1/organizations/{orgID}/members/{userID}/role` — change role

### `internal/handler/permissions.go`

RBAC enforcement utility:

```go
type Role string

const (
    RoleViewer    Role = "viewer"
    RoleCommenter Role = "commenter"
    RoleEditor    Role = "editor"
    RoleAdmin     Role = "admin"
)

// Permission actions
const (
    ActionView    = "view"
    ActionComment = "comment"
    ActionEdit    = "edit"
    ActionDelete  = "delete"
    ActionManage  = "manage"
)

// rolePermissions maps role → allowed actions
var rolePermissions = map[Role][]string{
    RoleViewer:    {ActionView},
    RoleCommenter: {ActionView, ActionComment},
    RoleEditor:    {ActionView, ActionComment, ActionEdit},
    RoleAdmin:     {ActionView, ActionComment, ActionEdit, ActionDelete, ActionManage},
}

func CheckPermission(ctx context.Context, pool *pgxpool.Pool, userID, documentID, action string) error {
    // Check: is user the document owner?
    var ownerID string
    err := pool.QueryRow(ctx,
        `SELECT user_id FROM documents WHERE id = $1`, documentID,
    ).Scan(&ownerID)
    if err != nil { return apierror.ErrNotFound }

    if ownerID == userID {
        return nil // Owner has full access
    }

    // Check: explicit permission via document_permissions table
    var role string
    err = pool.QueryRow(ctx,
        `SELECT role FROM document_permissions WHERE document_id = $1 AND user_id = $2`,
        documentID, userID,
    ).Scan(&role)
    if err != nil { return apierror.ErrForbidden }

    // Check if role allows action
    perms := rolePermissions[Role(role)]
    for _, p := range perms {
        if p == action { return nil }
    }
    return apierror.ErrForbidden
}
```

### `internal/handler/billing.go`

Endpoints:
- `POST /v1/billing/checkout` — create Stripe checkout session
- `GET /v1/billing/subscription` — get current subscription
- `POST /v1/billing/subscription/cancel` — cancel subscription
- `GET /v1/billing/usage` — get usage stats
- `GET /v1/billing/invoices` — list invoices

**CRITICAL:** All Stripe API calls OUTSIDE DB transactions.

### `internal/handler/webhooks.go`

Stripe webhook handler. **ALWAYS return 200**, even on processing errors:

```go
func StripeWebhook(pool *pgxpool.Pool, webhookSecret string) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        payload, err := io.ReadAll(io.LimitReader(r.Body, 65536))
        if err != nil {
            w.WriteHeader(http.StatusOK) // ALWAYS 200
            return
        }

        event, err := webhook.ConstructEvent(payload, r.Header.Get("Stripe-Signature"), webhookSecret)
        if err != nil {
            w.WriteHeader(http.StatusOK) // ALWAYS 200
            return
        }

        switch event.Type {
        case "customer.subscription.created", "customer.subscription.updated":
            handleSubscriptionUpdate(r.Context(), pool, event)
        case "customer.subscription.deleted":
            handleSubscriptionDeleted(r.Context(), pool, event)
        case "invoice.payment_failed":
            handlePaymentFailed(r.Context(), pool, event)
        }

        // If processing fails, insert into pending_webhooks for retry
        // ALWAYS return 200
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(map[string]string{"received": "true"})
    }
}
```

### `internal/handler/ai.go`

AI proxy with SSE streaming relay:

```go
func AIComplete(aiProxy *ai.Proxy, valkey *storage.ValkeyStore) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        user := auth.UserFromContext(r.Context())

        // Check AI quota
        if !billing.CheckAIQuota(user.Plan, getCurrentAIUsage(r.Context(), pool, user.UserID)) {
            apierror.ErrQuotaExceeded.WithMessage("AI request limit reached for your plan").Write(w)
            return
        }

        var req AICompleteRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            apierror.ErrInvalidJSON.Write(w)
            return
        }

        // PII detection before sending to provider
        // ... (see internal/ai/proxy.go)

        // SSE streaming response
        w.Header().Set("Content-Type", "text/event-stream")
        w.Header().Set("Cache-Control", "no-cache")
        w.Header().Set("Connection", "keep-alive")
        flusher, _ := w.(http.Flusher)

        stream := aiProxy.Complete(r.Context(), req)
        for chunk := range stream {
            data, _ := json.Marshal(chunk)
            fmt.Fprintf(w, "data: %s\n\n", data)
            flusher.Flush()
        }
    }
}
```

### `internal/handler/exports.go`

- `POST /v1/exports` → insert into `export_jobs` (status=pending), return 202
- `GET /v1/exports/{id}` → if status=completed → 302 redirect to R2 presigned URL, else return status JSON

### `internal/handler/users.go`

- `GET /v1/users/me` → return user profile with usage stats (documents count, AI requests this month, exports count)

### `internal/handler/apikeys.go`

- `POST /v1/api-keys` → generate key, hash, store in DB, return raw key (once!)
- `GET /v1/api-keys` → list keys (show prefix only, NOT full key)
- `DELETE /v1/api-keys/{id}` → delete key

### `internal/handler/auth.go`

- `POST /v1/auth/token` → validate API key → generate short-lived JWT for client-side use

### `internal/handler/metrics.go`

```go
func Metrics() http.Handler {
    return promhttp.Handler()
}
```

Register Prometheus counters/histograms:
- `gotipe_api_requests_total` (Counter, labels: method, path, status)
- `gotipe_api_latency_seconds` (Histogram, labels: method, path)
- `gotipe_ws_connections` (Gauge)
- `gotipe_ws_messages_total` (Counter, labels: type)
- `gotipe_ai_requests_total` (Counter, labels: provider, model, status)
- `gotipe_ai_tokens_total` (Counter, labels: direction=input|output)
- `gotipe_exports_total` (Counter, labels: format, status)
- `gotipe_exports_duration_seconds` (Histogram, labels: format)
- `gotipe_documents_total` (Counter)
- `gotipe_documents_active` (Gauge)

---

## 3.10 `internal/sync/` — WebSocket Sync Server

### `internal/sync/server.go`

```go
package sync

import (
    "context"
    "log/slog"
    "net/http"
    "sync"

    "github.com/gorilla/websocket"
    "github.com/gotipe/cloud/internal/auth"
)

var upgrader = websocket.Upgrader{
    ReadBufferSize:  4096,
    WriteBufferSize: 4096,
    CheckOrigin:     func(r *http.Request) bool { return true }, // CORS handled by middleware
}

type SyncServer struct {
    rooms      map[string]*Room
    mu         sync.RWMutex
    persist    PersistenceStore
    logger     *slog.Logger
    maxPerRoom int
}

func NewSyncServer(persist PersistenceStore, logger *slog.Logger, maxPerRoom int) *SyncServer {
    return &SyncServer{
        rooms:      make(map[string]*Room),
        persist:    persist,
        logger:     logger,
        maxPerRoom: maxPerRoom,
    }
}

func (s *SyncServer) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
    // 1. Auth: validate token from query param
    token := r.URL.Query().Get("token")
    peerID := r.URL.Query().Get("peerId")
    documentID := chi.URLParam(r, "documentID")

    user := auth.UserFromContext(r.Context())
    if user == nil {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }

    // 2. Upgrade to WebSocket
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        s.logger.Error("websocket upgrade failed", "err", err)
        return
    }

    // 3. Get or create room
    room := s.getOrCreateRoom(documentID)
    if room.ClientCount() >= s.maxPerRoom {
        conn.WriteMessage(websocket.CloseMessage,
            websocket.FormatCloseMessage(4004, "room_full"))
        conn.Close()
        return
    }

    // 4. Create client, add to room
    client := NewClient(conn, peerID, user, room, s.logger)
    room.AddClient(client)

    // 5. Send auth OK + initial state
    client.SendAuth(room.PeerIDs())
    client.SendState(room.GetState())

    // 6. Start read/write pumps
    go client.WritePump()
    go client.ReadPump()
}

func (s *SyncServer) getOrCreateRoom(documentID string) *Room {
    s.mu.Lock()
    defer s.mu.Unlock()

    if room, ok := s.rooms[documentID]; ok {
        return room
    }

    room := NewRoom(documentID, s.persist, s.logger)
    s.rooms[documentID] = room

    // Load persisted state
    go room.LoadState()

    return room
}

// Shutdown gracefully closes all rooms
func (s *SyncServer) Shutdown(ctx context.Context) {
    s.mu.Lock()
    defer s.mu.Unlock()

    for _, room := range s.rooms {
        room.Close(ctx)
    }
}
```

### `internal/sync/room.go`

```go
type Room struct {
    documentID string
    clients    map[string]*Client
    mu         sync.RWMutex
    state      []byte // CRDT snapshot
    awareness  map[string][]byte
    persist    PersistenceStore
    logger     *slog.Logger
    saveTimer  *time.Timer
    saveMu     sync.Mutex
}

func NewRoom(documentID string, persist PersistenceStore, logger *slog.Logger) *Room { ... }

func (r *Room) AddClient(c *Client) { ... }
func (r *Room) RemoveClient(peerID string) { ... }
func (r *Room) Broadcast(senderPeerID string, msg []byte) { ... } // Send to all except sender
func (r *Room) BroadcastAwareness(senderPeerID string, msg []byte) { ... }
func (r *Room) ApplyUpdate(data []byte) { ... } // Merge CRDT update into room state
func (r *Room) GetState() []byte { ... }
func (r *Room) PeerIDs() []string { ... }
func (r *Room) ClientCount() int { ... }

// ScheduleSave debounces persistence (2s after last update)
func (r *Room) ScheduleSave() {
    r.saveMu.Lock()
    defer r.saveMu.Unlock()

    if r.saveTimer != nil {
        r.saveTimer.Stop()
    }
    r.saveTimer = time.AfterFunc(2*time.Second, func() {
        if err := r.persist.SaveDocument(context.Background(), r.documentID, r.state); err != nil {
            r.logger.Error("failed to save document", "doc", r.documentID, "err", err)
        }
    })
}

func (r *Room) Close(ctx context.Context) {
    r.mu.Lock()
    defer r.mu.Unlock()

    // Notify all clients
    for _, c := range r.clients {
        c.Close()
    }

    // Final save
    if r.state != nil {
        r.persist.SaveDocument(ctx, r.documentID, r.state)
    }
}
```

### `internal/sync/client.go`

WebSocket client with read/write pump. Binary message format:

```
┌──────────┬──────────┬──────────────┬──────────────────┐
│ Type (1B)│ Flags(1B)│ Length (4B)  │ Payload (var)    │
└──────────┴──────────┴──────────────┴──────────────────┘

Types: 0x01=SyncStep1, 0x02=SyncStep2, 0x03=Update, 0x04=Awareness,
       0x05=AwarenessQuery, 0x06=Snapshot, 0x07=SnapshotRequest,
       0x08=Auth, 0x09=Error

Flags: bit0=compressed(zstd), bit1=requiresACK, bit2=isResponse
```

ReadPump: read binary messages → parse type → route to Room (Update → ApplyUpdate + Broadcast, Awareness → BroadcastAwareness, SyncStep1 → respond with SyncStep2).

WritePump: read from send channel → write to WebSocket.

zstd compression for payloads >1KB using `github.com/klauspost/compress/zstd`.

### `internal/sync/persistence.go`

```go
type PersistenceStore interface {
    LoadDocument(ctx context.Context, documentID string) ([]byte, error)
    SaveDocument(ctx context.Context, documentID string, state []byte) error
    SaveUpdate(ctx context.Context, documentID string, peerID string, data []byte) error
    GetHistory(ctx context.Context, documentID string, since int64) ([][]byte, error)
}
```

Implementation uses PostgreSQL (`document_updates` table for incremental updates) + R2 (`document_snapshots` for full snapshots).

---

## 3.11 `internal/ai/` — AI Proxy

### `internal/ai/proxy.go`

Routes requests to provider with fallback chain (OpenAI → Anthropic → Gemini on failure). SSE streaming relay. PII detection before send. Rate limit per key/user/provider.

```go
type Proxy struct {
    providers []Provider
    cache     *Cache
    logger    *slog.Logger
}

type Provider interface {
    Name() string
    Complete(ctx context.Context, req CompletionRequest) (<-chan StreamChunk, error)
}

type StreamChunk struct {
    Delta string `json:"delta"`
    Done  bool   `json:"done"`
    Usage *Usage `json:"usage,omitempty"`
}

type Usage struct {
    InputTokens  int `json:"input_tokens"`
    OutputTokens int `json:"output_tokens"`
}
```

Fallback chain: try primary provider → on error/timeout → try secondary → try tertiary. Streaming timeout: 30s max per request.

### `internal/ai/cache.go`

Semantic cache: cosine similarity threshold >0.95 for cache hit. Valkey storage, TTL 1h.

### `internal/ai/providers.go`

Three providers:
- **OpenAI:** SSE streaming via `POST /v1/chat/completions` with `stream: true`
- **Anthropic:** SSE streaming via `POST /v1/messages` with `stream: true`
- **Gemini:** SSE streaming via `POST /v1beta/models/{model}:streamGenerateContent`

Mode-specific defaults: temperature inline=0.1, command=0.3. maxTokens inline=128, command=2048.

---

## 3.12 `internal/worker/` — Background Workers

### `internal/worker/cleanup.go`

Ticker: 1 hour. Tasks:
1. `cleanOrphanExports` — DELETE export_jobs WHERE completed_at < now() - 7 days, delete R2 files
2. `compactDocumentUpdates` — documents with >200 incremental updates → merge into snapshot, delete updates
3. `cleanExpiredTokens` — clean stale session data
4. `aggregateUsage` — summarize usage_logs into daily aggregates

### `internal/worker/retry.go`

Ticker: 30 seconds. Tasks:
1. `retryPendingWebhooks` — SELECT from pending_webhooks WHERE next_retry_at <= now() AND attempts < 5, send HTTP POST, exponential backoff: 10s, 60s, 300s, 1800s, 10800s

### `internal/worker/export.go`

Ticker: ExportPollInterval (default 1s). Poll `export_jobs` WHERE status='pending', process up to ExportWorkers concurrently. Execute Rust export binary, upload result to R2, update job status.

### `internal/worker/billing.go`

Daily at midnight: aggregate usage per customer (COUNT usage_logs GROUP BY user_id, event_type). Monthly on 1st: generate billing summary, track token usage for AI.

All workers implement:
```go
type Worker interface {
    Run(ctx context.Context)
    Stop()
}
```

Pattern: `go worker.Run(ctx)` in main.go. Stop via context cancellation in shutdown.

---

## 3.13 `cmd/api/main.go` — Entrypoint

```go
package main

import (
    "context"
    "log/slog"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/go-chi/chi/v5"
    chimiddleware "github.com/go-chi/chi/v5/middleware"

    "github.com/gotipe/cloud/internal/config"
    "github.com/gotipe/cloud/internal/logger"
    "github.com/gotipe/cloud/internal/storage"
    "github.com/gotipe/cloud/internal/auth"
    "github.com/gotipe/cloud/internal/middleware"
    "github.com/gotipe/cloud/internal/handler"
    "github.com/gotipe/cloud/internal/sync"
    "github.com/gotipe/cloud/internal/worker"
    "github.com/gotipe/cloud/internal/billing"
    "github.com/gotipe/cloud/internal/audit"
    "github.com/gotipe/cloud/internal/ai"
)

func main() {
    // 1. Load config
    cfg, err := config.Load()
    if err != nil {
        panic(err)
    }

    // 2. Setup logger
    log := logger.Setup(cfg.LogLevel, cfg.LogFormat)
    slog.SetDefault(log)

    // 3. Connect storage
    ctx := context.Background()

    db, err := storage.NewPostgresStore(ctx, cfg.DatabaseURL, cfg.DBMaxConns, cfg.DBIdleConns)
    if err != nil { log.Error("postgres connect failed", "err", err); os.Exit(1) }

    valkey, err := storage.NewValkeyStore(cfg.ValkeyURL, cfg.ValkeyPassword, cfg.ValkeyMaxConns)
    if err != nil { log.Error("valkey connect failed", "err", err); os.Exit(1) }

    r2, err := storage.NewR2Store(ctx, cfg.R2AccountID, cfg.R2AccessKeyID, cfg.R2SecretKey,
        cfg.R2Bucket, cfg.R2CDNUrl, cfg.S3Endpoint, cfg.S3UsePathStyle)
    if err != nil { log.Error("r2 connect failed", "err", err); os.Exit(1) }

    // 4. Setup auth
    jwtSvc, err := auth.NewJWTService(cfg.JWTPrivateKeyPEM, cfg.JWTPublicKeyPEM,
        cfg.JWTIssuer, cfg.JWTAudience, cfg.JWTExpiry)
    if err != nil { log.Error("jwt setup failed", "err", err); os.Exit(1) }

    apiKeySvc := auth.NewAPIKeyService(db.Pool)

    // 5. Setup services
    stripeSvc := billing.NewStripeClient(cfg.StripeSecretKey)
    auditLog := audit.NewAuditLogger(db.Pool)
    aiProxy := ai.NewProxy(cfg, valkey, log)

    // 6. Setup rate limiters
    apiLimit, apiWindow, _ := config.ParseRateLimit(cfg.RateLimitAPI)
    apiRateLimiter, err := middleware.NewRateLimiter(valkey, apiLimit, apiWindow)
    if err != nil { log.Error("rate limiter setup failed", "err", err); os.Exit(1) }

    // 7. Build router
    r := chi.NewRouter()

    // Middleware chain (ORDER MATTERS)
    r.Use(middleware.RequestIDMiddleware)
    r.Use(middleware.LoggerMiddleware(log))
    r.Use(chimiddleware.Recoverer)
    r.Use(middleware.CSPMiddleware)
    r.Use(middleware.CORSMiddleware([]string{"*"})) // Configure for production

    // Health (no auth)
    r.Get("/healthz", handler.Healthz())
    r.Get("/readyz", handler.Readyz(db, valkey, r2))
    r.Handle("/metrics", handler.Metrics())

    // Stripe webhooks (no auth, but signature verification)
    r.Post("/webhooks/stripe", handler.StripeWebhook(db.Pool, cfg.StripeWebhookSecret))

    // Authenticated routes
    r.Group(func(r chi.Router) {
        r.Use(auth.AuthMiddleware(jwtSvc, apiKeySvc, valkey))
        r.Use(apiRateLimiter.Middleware())
        r.Use(middleware.IdempotencyMiddleware(valkey))

        // Documents
        r.Post("/v1/documents", handler.CreateDocument(db, r2, auditLog))
        r.Get("/v1/documents", handler.ListDocuments(db))
        r.Get("/v1/documents/{id}", handler.GetDocument(db, r2))
        r.Delete("/v1/documents/{id}", handler.DeleteDocument(db, r2, auditLog))

        // Comments
        r.Post("/v1/documents/{docID}/comments", handler.CreateComment(db, auditLog))
        r.Get("/v1/documents/{docID}/comments", handler.ListComments(db))
        r.Post("/v1/documents/{docID}/comments/{commentID}/replies", handler.ReplyToComment(db))
        r.Post("/v1/documents/{docID}/comments/{commentID}/resolve", handler.ResolveComment(db, auditLog))
        r.Delete("/v1/documents/{docID}/comments/{commentID}", handler.DeleteComment(db, auditLog))

        // Versions
        r.Get("/v1/documents/{docID}/versions", handler.ListVersions(db))
        r.Post("/v1/documents/{docID}/versions", handler.CreateVersion(db, r2, auditLog))
        r.Post("/v1/documents/{docID}/versions/{versionID}/restore", handler.RestoreVersion(db, r2, auditLog))
        r.Get("/v1/documents/{docID}/versions/diff", handler.DiffVersions(db, r2))

        // Organizations
        r.Post("/v1/organizations", handler.CreateOrg(db, auditLog))
        r.Get("/v1/organizations", handler.ListOrgs(db))
        r.Put("/v1/organizations/{orgID}", handler.UpdateOrg(db))
        r.Delete("/v1/organizations/{orgID}", handler.DeleteOrg(db, auditLog))
        r.Post("/v1/organizations/{orgID}/members", handler.AddOrgMember(db, auditLog))
        r.Delete("/v1/organizations/{orgID}/members/{userID}", handler.RemoveOrgMember(db, auditLog))
        r.Put("/v1/organizations/{orgID}/members/{userID}/role", handler.ChangeOrgMemberRole(db, auditLog))

        // Users
        r.Get("/v1/users/me", handler.GetCurrentUser(db))

        // API Keys
        r.Post("/v1/api-keys", handler.CreateAPIKey(db, auditLog))
        r.Get("/v1/api-keys", handler.ListAPIKeys(db))
        r.Delete("/v1/api-keys/{id}", handler.DeleteAPIKey(db, auditLog))

        // Exports
        r.Post("/v1/exports", handler.CreateExport(db, auditLog))
        r.Get("/v1/exports/{id}", handler.GetExport(db, r2))

        // AI Proxy
        r.Post("/v1/ai/complete", handler.AIComplete(aiProxy, valkey))

        // Auth Token
        r.Post("/v1/auth/token", handler.CreateToken(jwtSvc, db))

        // Billing
        r.Post("/v1/billing/checkout", handler.CreateCheckout(stripeSvc, db))
        r.Get("/v1/billing/subscription", handler.GetSubscription(db))
        r.Post("/v1/billing/subscription/cancel", handler.CancelSubscription(stripeSvc, db, auditLog))
        r.Get("/v1/billing/usage", handler.GetUsage(db))
        r.Get("/v1/billing/invoices", handler.GetInvoices(db))
    })

    // 8. Setup WebSocket sync server
    syncPersist := sync.NewPgR2Persistence(db.Pool, r2)
    syncServer := sync.NewSyncServer(syncPersist, log, 50) // max 50 clients per room

    // WebSocket route (separate from REST middleware for binary protocol)
    r.Group(func(r chi.Router) {
        r.Use(auth.AuthMiddleware(jwtSvc, apiKeySvc, valkey))
        r.Get("/ws/{documentID}", syncServer.HandleWebSocket)
    })

    // 9. Start background workers
    workerCtx, workerCancel := context.WithCancel(context.Background())
    cleanupWorker := worker.NewCleanupWorker(db.Pool, r2, log)
    retryWorker := worker.NewRetryWorker(db.Pool, log)
    exportWorker := worker.NewExportWorker(db.Pool, r2, cfg, log)
    billingWorker := worker.NewBillingWorker(db.Pool, log)

    go cleanupWorker.Run(workerCtx)
    go retryWorker.Run(workerCtx)
    go exportWorker.Run(workerCtx)
    go billingWorker.Run(workerCtx)

    // 10. Start HTTP server
    srv := &http.Server{Addr: cfg.ListenAddr, Handler: r}
    go func() {
        log.Info("starting API server", "addr", cfg.ListenAddr)
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            log.Error("server error", "err", err)
        }
    }()

    // 11. Wait for shutdown signal
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    log.Info("shutdown: starting graceful shutdown")

    // Phase 1: Stop accepting new connections
    shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer shutdownCancel()

    // Phase 2: Drain HTTP in-flight requests
    if err := srv.Shutdown(shutdownCtx); err != nil {
        log.Error("shutdown: http drain failed", "err", err)
    }
    log.Info("shutdown: http drained")

    // Phase 3: Close WebSocket rooms
    syncServer.Shutdown(shutdownCtx)
    log.Info("shutdown: sync rooms closed")

    // Phase 4: Stop background workers
    workerCancel()
    log.Info("shutdown: workers stopped")

    // Phase 5: Close storage connections
    db.Close()
    valkey.Close()
    log.Info("shutdown: storage closed")

    // Phase 6: Exit
    log.Info("shutdown: complete")
}
```

---

## 3.14 Migrations

### `migrations/001_initial.up.sql`

```sql
-- Users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL DEFAULT '',
    password_hash   TEXT,
    oauth_provider  TEXT,
    oauth_id        TEXT,
    plan            TEXT NOT NULL DEFAULT 'starter',
    stripe_customer_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL;

-- API Keys
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT '',
    key_hash        TEXT NOT NULL,
    key_prefix      TEXT NOT NULL,
    scopes          TEXT[] NOT NULL DEFAULT '{}',
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- Documents
CREATE TABLE documents (
    id              TEXT PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT '',
    version         BIGINT NOT NULL DEFAULT 0,
    r2_snapshot_key TEXT,
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    collaborators   JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_documents_updated ON documents(updated_at DESC);

-- Document Updates (incremental CRDT ops)
CREATE TABLE document_updates (
    id              BIGSERIAL PRIMARY KEY,
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    data            BYTEA NOT NULL,
    peer_id         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_updates_doc ON document_updates(document_id, id);

-- Document Snapshots
CREATE TABLE document_snapshots (
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version         BIGINT NOT NULL,
    r2_key          TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    peer_id         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, version)
);

-- Export Jobs
CREATE TABLE export_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    format          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    r2_result_key   TEXT,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_export_jobs_status ON export_jobs(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_export_jobs_user ON export_jobs(user_id, created_at DESC);

-- Usage Logs
CREATE TABLE usage_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_logs_user_type ON usage_logs(user_id, event_type, created_at DESC);
```

### `migrations/001_initial.down.sql`

```sql
DROP TABLE IF EXISTS usage_logs;
DROP TABLE IF EXISTS export_jobs;
DROP TABLE IF EXISTS document_snapshots;
DROP TABLE IF EXISTS document_updates;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS users;
```

### `migrations/002_comments_versions.up.sql`

```sql
-- Comments
CREATE TABLE comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    anchor_type     TEXT NOT NULL DEFAULT 'inline',
    anchor_data     JSONB NOT NULL DEFAULT '{}',
    author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    parent_id       UUID REFERENCES comments(id) ON DELETE CASCADE,
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_document ON comments(document_id);
CREATE INDEX idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_comments_author ON comments(author_id);

-- Comment Reactions
CREATE TABLE comment_reactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id      UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji           TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(comment_id, user_id, emoji)
);

-- Versions
CREATE TABLE versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT '',
    version_type    TEXT NOT NULL DEFAULT 'named',
    state_vector    BYTEA,
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    description     TEXT NOT NULL DEFAULT '',
    r2_key          TEXT,
    snapshot_size   BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_versions_document ON versions(document_id, created_at DESC);

-- Version Diffs (precomputed)
CREATE TABLE version_diffs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_version    UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
    to_version      UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
    diff_summary    JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(from_version, to_version)
);
```

### `migrations/002_comments_versions.down.sql`

```sql
DROP TABLE IF EXISTS version_diffs;
DROP TABLE IF EXISTS versions;
DROP TABLE IF EXISTS comment_reactions;
DROP TABLE IF EXISTS comments;
```

### `migrations/003_organizations.up.sql`

```sql
-- Organizations
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan            TEXT NOT NULL DEFAULT 'starter',
    stripe_customer_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orgs_owner ON organizations(owner_id);

-- Organization Members
CREATE TABLE org_members (
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'editor',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, user_id)
);

CREATE INDEX idx_org_members_user ON org_members(user_id);

-- Document Permissions
CREATE TABLE document_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'viewer',
    granted_by      UUID REFERENCES users(id),
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(document_id, user_id)
);

CREATE INDEX idx_doc_perms_document ON document_permissions(document_id);
CREATE INDEX idx_doc_perms_user ON document_permissions(user_id);
```

### `migrations/003_organizations.down.sql`

```sql
DROP TABLE IF EXISTS document_permissions;
DROP TABLE IF EXISTS org_members;
DROP TABLE IF EXISTS organizations;
```

### `migrations/004_billing.up.sql`

```sql
-- Subscriptions
CREATE TABLE subscriptions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID REFERENCES users(id) ON DELETE CASCADE,
    org_id                UUID REFERENCES organizations(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT NOT NULL UNIQUE,
    plan                  TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'active',
    current_period_start  TIMESTAMPTZ,
    current_period_end    TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (user_id IS NOT NULL OR org_id IS NOT NULL)
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_subscriptions_org ON subscriptions(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

-- Pending Webhooks (for retry)
CREATE TABLE pending_webhooks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL,
    attempts        INT NOT NULL DEFAULT 0,
    last_error      TEXT,
    next_retry_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_webhooks_retry ON pending_webhooks(next_retry_at) WHERE attempts < 5;
```

### `migrations/004_billing.down.sql`

```sql
DROP TABLE IF EXISTS pending_webhooks;
DROP TABLE IF EXISTS subscriptions;
```

### `migrations/005_audit.up.sql`

```sql
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL,
    action          TEXT NOT NULL,
    resource_type   TEXT NOT NULL,
    resource_id     TEXT NOT NULL,
    details         JSONB NOT NULL DEFAULT '{}',
    ip_address      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_action ON audit_log(action, created_at DESC);
```

### `migrations/005_audit.down.sql`

```sql
DROP TABLE IF EXISTS audit_log;
```

---

## 3.15 Dockerfile

```dockerfile
# ============================================================
# GoTipe Cloud — Multi-stage Dockerfile
# ============================================================

# Stage 1: Build
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o /gotipe-cloud \
    ./cmd/api

# Stage 2: Runtime
FROM alpine:3.20

RUN apk add --no-cache ca-certificates wget

COPY --from=builder /gotipe-cloud /gotipe-cloud
COPY migrations/ /migrations/

EXPOSE 8080 8081

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=5s \
    CMD wget -qO- http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/gotipe-cloud"]
```

---

## Верификация Фазы 3

```bash
# 1. Unit tests (all packages)
cd apps/cloud && go test ./... -race -count=1

# 2. Build binary
cd apps/cloud && go build -o /tmp/gotipe-cloud ./cmd/api

# 3. Integration tests (requires Docker for testcontainers)
cd apps/cloud && go test -tags=integration ./... -race

# 4. Vet + static analysis
cd apps/cloud && go vet ./...

# 5. Check binary size
ls -lh /tmp/gotipe-cloud  # Should be ~15-25MB

# 6. Docker build
docker build -t gotipe-cloud:test -f apps/cloud/Dockerfile apps/cloud/

# 7. Docker run smoke test
docker run --rm -e DATABASE_URL=... -e VALKEY_URL=... gotipe-cloud:test &
sleep 3
curl http://localhost:8080/healthz  # Should return {"status":"ok"}
```

---

## Подсказки по реализации

1. **Chi v5 URL params:** `chi.URLParam(r, "id")` — НЕ `r.PathValue("id")`
2. **pgx scanning arrays:** Для `TEXT[]` используй `pgx.Array(&scopes)` в Scan
3. **Valkey vs Redis:** API совместим. Используй `valkey-go` клиент, НЕ `go-redis`
4. **WebSocket binary:** `conn.ReadMessage()` возвращает `messageType` — проверяй `websocket.BinaryMessage`
5. **zstd compression:** `github.com/klauspost/compress/zstd` — создай encoder/decoder один раз, reuse
6. **Stripe webhook signature:** `stripe.ConstructEvent(payload, sigHeader, webhookSecret)` — НЕ доверяй payload без верификации подписи
7. **JWT ES256 key generation:** `openssl ecparam -genkey -name prime256v1 -noout -out private.pem && openssl ec -in private.pem -pubout -out public.pem`
8. **Context propagation:** Всегда передавай `r.Context()` в DB queries и storage calls. Worker'ы используют свой context с cancel
