# GoTipe — Промт для реализации Фазы 4: Инфраструктура

## Контекст

Ты реализуешь инфраструктуру GoTipe — Docker Compose стеки (production и dev), reverse proxy, конфигурации БД/кеша/бэкапов, мониторинг (Prometheus + Grafana), и скрипты деплоя. Фазы 1-3 (Rust crates, TypeScript packages, Go Cloud server) уже реализованы.

Фаза 4 = папка `infra/` + `scripts/`. Каждый файл должен быть **полностью рабочим** — production-ready конфигурации, не placeholder-ы.

## Обязательные правила

1. **pgBouncer transaction mode:** НЕ session-level features (SET LOCAL, prepared statements). Приложение подключается к pgBouncer (порт 6432), миграции напрямую к Postgres (порт 5432)
2. **Valkey (НЕ Redis):** image = `valkey/valkey:8-alpine`. DB 0 = cache (allkeys-lru), DB 1 = JWT blocklist (noeviction, AOF). Команды = `valkey-cli`, `valkey-server`
3. **Cloudflare R2 в production:** Object storage через S3 API. MinIO только для dev. Credentials через `.env`
4. **Caddy reverse proxy:** auto TLS через Let's Encrypt. Минимальный Caddyfile
5. **Prometheus profiles:** monitoring stack (Prometheus + Grafana) = Docker Compose profile `monitoring`, не запускается по умолчанию
6. **pgBackRest → R2:** Бэкапы PostgreSQL в Cloudflare R2 через S3 protocol. AES-256 encryption, zstd compression
7. **Zero-downtime deploy:** scale api=2 → health check → stop old container. Миграции ДО старта новой версии
8. **Graceful shutdown:** Docker `stop_grace_period: 35s` для API и Sync. Go server drains за 30s
9. **Healthcheck на всех сервисах:** Postgres (`pg_isready`), Valkey (`valkey-cli ping`), API/Sync (`wget /healthz`)
10. **Все секреты через .env:** Никаких hardcoded credentials. `.env.example` содержит ВСЕ переменные с комментариями

## Порядок реализации

```
4.1 .env.example → 4.2 docker-compose.yml (prod) → 4.3 docker-compose.dev.yml → 4.4 Caddyfile → 4.5 postgresql.conf → 4.6 pgbouncer.ini → 4.7 valkey.conf → 4.8 pgbackrest.conf → 4.9 prometheus.yml → 4.10 Grafana dashboards → 4.11 setup-server.sh → 4.12 deploy.sh → 4.13 restore.sh → 4.14 backup-cron → 4.15 rate-limit.lua → 4.16 build-wasm.sh → 4.17 dev.sh → 4.18 Verify
```

---

## 4.1 `infra/.env.example`

Все переменные окружения GoTipe Cloud. Без реальных секретов, с описаниями:

```bash
# ============================================================
# GoTipe Cloud — Environment Configuration
# ============================================================
# Copy to .env and fill in real values before deployment

# --- Server ---
LISTEN_ADDR=:8080                    # API server listen address
SYNC_LISTEN_ADDR=:8081               # WebSocket sync server address
METRICS_LISTEN_ADDR=:9090            # Prometheus metrics endpoint
ENV=production                       # production | development

# --- PostgreSQL ---
POSTGRES_PASSWORD=CHANGE_ME          # PostgreSQL password (used by docker-compose)
DATABASE_URL=postgres://gotipe:${POSTGRES_PASSWORD}@pgbouncer:6432/gotipe?sslmode=disable
DATABASE_DIRECT_URL=postgres://gotipe:${POSTGRES_PASSWORD}@postgres:5432/gotipe?sslmode=disable  # For migrations (bypass pgBouncer)
DATABASE_MAX_CONNS=50
DATABASE_IDLE_CONNS=10

# --- Valkey (Redis-compatible) ---
VALKEY_URL=redis://valkey:6379/0
VALKEY_PASSWORD=
VALKEY_MAX_CONNS=20

# --- Cloudflare R2 (Production) ---
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET=gotipe-data
R2_CDN_URL=https://cdn.gotipe.com    # R2 public bucket custom domain

# --- MinIO (Local Development Only — uncomment for dev) ---
# S3_ENDPOINT=http://minio:9000
# S3_BUCKET=gotipe-data
# S3_ACCESS_KEY=minioadmin
# S3_SECRET_KEY=minioadmin
# S3_USE_PATH_STYLE=true

# --- Auth ---
JWT_PRIVATE_KEY_PATH=/etc/gotipe/ec-private.pem   # ECDSA P-256 private key (ES256)
JWT_PUBLIC_KEY_PATH=/etc/gotipe/ec-public.pem      # ECDSA P-256 public key
JWT_ISSUER=gotipe
JWT_AUDIENCE=gotipe-cloud
JWT_EXPIRY=3600                       # seconds

OAUTH_GITHUB_CLIENT_ID=
OAUTH_GITHUB_CLIENT_SECRET=
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=

# --- AI Proxy ---
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...
AI_DEFAULT_PROVIDER=openai
AI_DEFAULT_MODEL=gpt-4o-mini
AI_CACHE_TTL=300                      # seconds
AI_MAX_TOKENS=4096

# --- Export Service ---
EXPORT_WORKERS=4                      # concurrent export workers
EXPORT_POLL_INTERVAL=1s               # queue poll interval
EXPORT_MAX_DOCUMENT_SIZE=10485760     # 10MB max document for export
EXPORT_R2_PREFIX=exports/

# --- Rate Limiting ---
RATE_LIMIT_API=100/min                # REST API per key
RATE_LIMIT_WS=1000/min               # WebSocket messages per connection
RATE_LIMIT_AI=60/min                  # AI proxy per key

# --- Stripe ---
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_BUSINESS=price_...

# --- Monitoring ---
PROMETHEUS_ENABLED=true
LOG_LEVEL=info                        # debug, info, warn, error
LOG_FORMAT=json                       # json, text

# --- Backup (pgBackRest) ---
BACKUP_ENCRYPTION_KEY=CHANGE_ME       # AES-256-CBC encryption key for backups
```

---

## 4.2 `infra/docker-compose.yml` — Production

Полный production stack. Cloudflare R2 для storage (нет MinIO-контейнера). Monitoring через profile.

```yaml
# infra/docker-compose.yml (Production)
services:
  # --- Caddy (Reverse Proxy + Auto TLS) ---
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      api:
        condition: service_healthy
      sync:
        condition: service_healthy
    restart: always
    networks:
      - frontend
      - backend

  # --- GoTipe API Server ---
  api:
    image: ghcr.io/gotipe/cloud-api:latest
    expose:
      - "8080"
    env_file: .env
    environment:
      LISTEN_ADDR: ":8080"
      DATABASE_URL: "postgres://gotipe:${POSTGRES_PASSWORD}@pgbouncer:6432/gotipe?sslmode=disable"
      VALKEY_URL: "redis://valkey:6379/0"
      ENV: "production"
      LOG_FORMAT: "json"
    depends_on:
      pgbouncer:
        condition: service_started
      valkey:
        condition: service_healthy
    restart: always
    stop_grace_period: 35s
    deploy:
      resources:
        limits:
          memory: 512M
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/healthz"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s
    networks:
      - backend

  # --- GoTipe WebSocket Sync Server ---
  sync:
    image: ghcr.io/gotipe/cloud-sync:latest
    expose:
      - "8081"
    env_file: .env
    environment:
      SYNC_LISTEN_ADDR: ":8081"
      DATABASE_URL: "postgres://gotipe:${POSTGRES_PASSWORD}@pgbouncer:6432/gotipe?sslmode=disable"
      VALKEY_URL: "redis://valkey:6379/0"
      ENV: "production"
      LOG_FORMAT: "json"
    depends_on:
      pgbouncer:
        condition: service_started
      valkey:
        condition: service_healthy
    restart: always
    stop_grace_period: 35s
    deploy:
      resources:
        limits:
          memory: 2G
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8081/healthz"]
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      - backend

  # --- Export Worker ---
  export-worker:
    image: ghcr.io/gotipe/cloud-export:latest
    env_file: .env
    environment:
      DATABASE_URL: "postgres://gotipe:${POSTGRES_PASSWORD}@pgbouncer:6432/gotipe?sslmode=disable"
      VALKEY_URL: "redis://valkey:6379/0"
      EXPORT_WORKERS: "4"
      EXPORT_POLL_INTERVAL: "1s"
    depends_on:
      pgbouncer:
        condition: service_started
    restart: always
    deploy:
      resources:
        limits:
          memory: 2G
    networks:
      - backend

  # --- pgBouncer (Connection Pooling) ---
  pgbouncer:
    image: bitnami/pgbouncer:latest
    environment:
      PGBOUNCER_DATABASE: gotipe
      POSTGRESQL_HOST: postgres
      POSTGRESQL_PORT: "5432"
      POSTGRESQL_USERNAME: gotipe
      POSTGRESQL_PASSWORD: "${POSTGRES_PASSWORD}"
      PGBOUNCER_POOL_MODE: transaction
      PGBOUNCER_MAX_CLIENT_CONN: "200"
      PGBOUNCER_DEFAULT_POOL_SIZE: "20"
      PGBOUNCER_MIN_POOL_SIZE: "5"
      PGBOUNCER_RESERVE_POOL_SIZE: "5"
      PGBOUNCER_RESERVE_POOL_TIMEOUT: "3"
    expose:
      - "6432"
    depends_on:
      postgres:
        condition: service_healthy
    restart: always
    networks:
      - backend

  # --- PostgreSQL ---
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: gotipe
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
      POSTGRES_DB: gotipe
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gotipe"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: always
    networks:
      - backend

  # --- Valkey (Redis-compatible) ---
  valkey:
    image: valkey/valkey:8-alpine
    volumes:
      - valkey_data:/data
      - ./valkey/valkey.conf:/etc/valkey/valkey.conf:ro
    command: valkey-server /etc/valkey/valkey.conf
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: always
    networks:
      - backend

  # --- Prometheus (optional, monitoring profile) ---
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'
    profiles:
      - monitoring
    restart: always
    networks:
      - backend

  # --- Grafana (optional, monitoring profile) ---
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: "${GRAFANA_ADMIN_PASSWORD:-admin}"
      GF_INSTALL_PLUGINS: "grafana-clock-panel"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./grafana/datasources:/etc/grafana/provisioning/datasources:ro
    profiles:
      - monitoring
    restart: always
    networks:
      - backend

networks:
  frontend:
  backend:

volumes:
  postgres_data:
  valkey_data:
  caddy_data:
  caddy_config:
  prometheus_data:
  grafana_data:
```

---

## 4.3 `infra/docker-compose.dev.yml` — Local Development

MinIO заменяет R2. Порты открыты напрямую. Нет Caddy/pgBouncer. Миграции через init scripts.

```yaml
# infra/docker-compose.dev.yml (Local Development)
services:
  postgres:
    image: postgres:17-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: gotipe
      POSTGRES_PASSWORD: gotipe
      POSTGRES_DB: gotipe
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gotipe"]
      interval: 5s
      timeout: 3s
      retries: 5

  valkey:
    image: valkey/valkey:8-alpine
    ports:
      - "6379:6379"
    volumes:
      - valkey_dev_data:/data
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_dev_data:/data
    command: server /data --console-address ":9001"

  minio-init:
    image: minio/mc:latest
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
        sleep 3;
        mc alias set local http://minio:9000 minioadmin minioadmin;
        mc mb local/gotipe-data --ignore-existing;
        exit 0;
      "

volumes:
  postgres_dev_data:
  valkey_dev_data:
  minio_dev_data:
```

---

## 4.4 `infra/Caddyfile`

Reverse proxy с auto TLS. CSP headers для WASM support.

```
# infra/Caddyfile
# Caddy reverse proxy — auto TLS via Let's Encrypt

api.gotipe.com {
    reverse_proxy api:8080

    header {
        # Security headers
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        # CSP с WASM support
        Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' wss://sync.gotipe.com https://api.gotipe.com; frame-src 'none'; object-src 'none'; base-uri 'self'"
    }
}

sync.gotipe.com {
    reverse_proxy sync:8081
}
```

---

## 4.5 `infra/postgres/postgresql.conf`

Tuned для Hetzner CX32 (4 vCPU, 8 GB RAM). Оптимизация для JSONB workload и CRDT binary data.

```ini
# infra/postgres/postgresql.conf
# PostgreSQL 17 — tuned for Hetzner CX32 (4 vCPU, 8 GB RAM)

# --- Memory ---
shared_buffers = 2GB                    # 25% of RAM
effective_cache_size = 6GB              # 75% of RAM
work_mem = 64MB                         # per-operation sort/hash memory
maintenance_work_mem = 512MB            # for VACUUM, CREATE INDEX

# --- Connections ---
max_connections = 200                   # pgBouncer handles client connections
superuser_reserved_connections = 3

# --- WAL ---
wal_level = replica                     # required for pgBackRest
max_wal_size = 2GB
min_wal_size = 512MB
wal_compression = zstd
archive_mode = on
archive_command = 'pgbackrest --stanza=gotipe archive-push %p'

# --- Checkpoints ---
checkpoint_completion_target = 0.9
checkpoint_timeout = 10min

# --- Query Planner ---
random_page_cost = 1.1                  # NVMe SSD
effective_io_concurrency = 200          # NVMe SSD
default_statistics_target = 100

# --- Parallel Query ---
max_parallel_workers_per_gather = 2
max_parallel_workers = 4
max_parallel_maintenance_workers = 2

# --- Logging ---
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 200        # log queries slower than 200ms
log_checkpoints = on
log_connections = off                   # pgBouncer reconnects frequently
log_disconnections = off
log_lock_waits = on

# --- Autovacuum ---
autovacuum_max_workers = 3
autovacuum_naptime = 30s
autovacuum_vacuum_scale_factor = 0.05   # more aggressive for busy tables
autovacuum_analyze_scale_factor = 0.025

# --- Locale ---
lc_messages = 'en_US.UTF-8'
timezone = 'UTC'

# --- Listen ---
listen_addresses = '*'
port = 5432
```

---

## 4.6 `infra/pgbouncer/pgbouncer.ini`

Transaction pooling mode. НЕ session-level features.

```ini
; infra/pgbouncer/pgbouncer.ini
; pgBouncer — transaction mode pooling for GoTipe Cloud

[databases]
gotipe = host=postgres port=5432 dbname=gotipe

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

; --- Pool Mode ---
pool_mode = transaction                 ; CRITICAL: transaction mode, NOT session
                                        ; No SET LOCAL, no prepared statements,
                                        ; no session-level advisory locks

; --- Pool Sizing ---
max_client_conn = 200                   ; max incoming connections from application
default_pool_size = 20                  ; connections per database per user
min_pool_size = 5                       ; keep warm connections
reserve_pool_size = 5                   ; emergency overflow
reserve_pool_timeout = 3                ; seconds before using reserve pool

; --- Timeouts ---
server_idle_timeout = 600               ; close idle server connections after 10min
client_idle_timeout = 0                 ; no timeout for client idle
server_connect_timeout = 5
server_login_retry = 1
query_timeout = 30                      ; kill queries running longer than 30s
query_wait_timeout = 120                ; max time client waits for server connection

; --- Connection Limits ---
max_db_connections = 50                 ; per database
max_user_connections = 0                ; unlimited per user

; --- Logging ---
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1
stats_period = 60

; --- Admin ---
admin_users = gotipe
```

---

## 4.7 `infra/valkey/valkey.conf`

Two-DB setup: DB 0 = cache (evictable), DB 1 = JWT blocklist (persistent, noeviction).

```conf
# infra/valkey/valkey.conf
# Valkey 8 configuration for GoTipe Cloud

# --- Network ---
bind 0.0.0.0
port 6379
tcp-backlog 511
timeout 300
tcp-keepalive 60

# --- Memory ---
maxmemory 1gb
maxmemory-policy allkeys-lru           # DB 0: evict least recently used keys
                                       # NOTE: DB 1 (JWT blocklist) uses SELECT 1
                                       # with noeviction enforced at application level.
                                       # Valkey does not support per-DB eviction policy.
                                       # App-level check: if DB=1 and OOM, reject writes
                                       # and alert (critical: JWT blocklist must not lose data)

# --- Persistence (AOF) ---
appendonly yes                          # Required for JWT blocklist durability
appendfsync everysec                    # Balance performance vs durability
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
aof-use-rdb-preamble yes               # Faster AOF loading

# --- RDB Snapshots ---
save 900 1                              # Save after 900s if at least 1 key changed
save 300 10                             # Save after 300s if at least 10 keys changed
save 60 10000                           # Save after 60s if at least 10000 keys changed
rdbcompression yes
rdbchecksum yes

# --- Databases ---
databases 2                             # DB 0 = cache/rate limits, DB 1 = JWT blocklist

# --- Connections ---
maxclients 1000

# --- Logging ---
loglevel notice
logfile ""                              # Stdout (Docker captures)

# --- Security ---
# requirepass is set via VALKEY_PASSWORD env var if needed

# --- Lua Scripting ---
lua-time-limit 200                      # 200ms max for Lua scripts (rate limiting)

# --- Slow Log ---
slowlog-log-slower-than 10000           # Log queries slower than 10ms
slowlog-max-len 128
```

---

## 4.8 `infra/pgbackrest/pgbackrest.conf`

PostgreSQL backup to Cloudflare R2 via S3 protocol. Encrypted, compressed.

```ini
# infra/pgbackrest/pgbackrest.conf
# pgBackRest — backup PostgreSQL to Cloudflare R2

[gotipe]
pg1-path=/var/lib/postgresql/data
pg1-port=5432

[global]
# --- Repository: Cloudflare R2 (S3-compatible) ---
repo1-type=s3
repo1-s3-bucket=gotipe-backups
repo1-s3-endpoint=${R2_ACCOUNT_ID}.r2.cloudflarestorage.com
repo1-s3-region=auto
repo1-s3-key=${R2_ACCESS_KEY_ID}
repo1-s3-key-secret=${R2_SECRET_ACCESS_KEY}
repo1-s3-uri-style=path

# --- Encryption ---
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=${BACKUP_ENCRYPTION_KEY}

# --- Retention ---
repo1-retention-full=4                  # Keep 4 full backups (~1 month)
repo1-retention-diff=30                 # Keep 30 differential backups

# --- Compression ---
compress-type=zst
compress-level=3

# --- Parallel ---
process-max=2                           # Parallel backup processes

# --- Archive ---
[global:archive-push]
compress-type=zst
compress-level=3

[global:archive-get]
process-max=2
```

---

## 4.9 `infra/prometheus.yml`

Scrape configs for all GoTipe services.

```yaml
# infra/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alerts.yml"

scrape_configs:
  # --- GoTipe API Server ---
  - job_name: gotipe-api
    static_configs:
      - targets: ["api:8080"]
    metrics_path: /metrics
    scrape_interval: 10s

  # --- GoTipe WebSocket Sync Server ---
  - job_name: gotipe-sync
    static_configs:
      - targets: ["sync:8081"]
    metrics_path: /metrics
    scrape_interval: 10s

  # --- PostgreSQL (via postgres_exporter) ---
  - job_name: postgres
    static_configs:
      - targets: ["postgres-exporter:9187"]

  # --- Valkey (via valkey-exporter) ---
  - job_name: valkey
    static_configs:
      - targets: ["valkey-exporter:9121"]

  # --- Prometheus self-monitoring ---
  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]
```

---

## 4.10 `infra/prometheus-alerts.yml`

Alert rules для критических метрик.

```yaml
# infra/prometheus-alerts.yml
groups:
  - name: gotipe-alerts
    rules:
      # --- API ---
      - alert: HighAPILatency
        expr: histogram_quantile(0.95, rate(gotipe_api_latency_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API p95 latency > 1s"
          description: "GoTipe API p95 latency is {{ $value }}s"

      - alert: HighAPIErrorRate
        expr: rate(gotipe_api_requests_total{status=~"5.."}[5m]) / rate(gotipe_api_requests_total[5m]) > 0.05
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "API 5xx error rate > 5%"

      # --- WebSocket ---
      - alert: WebSocketConnectionsHigh
        expr: gotipe_ws_connections > 10000
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "WebSocket connections > 10K"

      # --- Export ---
      - alert: ExportQueueBacklog
        expr: gotipe_export_pending_jobs > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Export queue backlog > 100 jobs"

      # --- AI Proxy ---
      - alert: AIProxyHighErrorRate
        expr: rate(gotipe_ai_requests_total{status="error"}[5m]) / rate(gotipe_ai_requests_total[5m]) > 0.1
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "AI proxy error rate > 10%"

      # --- Infrastructure ---
      - alert: PostgresConnectionPoolExhausted
        expr: pgbouncer_pools_server_active / pgbouncer_pools_server_total > 0.9
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "pgBouncer connection pool > 90% utilized"

      - alert: ValkeyMemoryHigh
        expr: valkey_used_memory_bytes / valkey_maxmemory_bytes > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Valkey memory usage > 85%"

      - alert: DiskSpaceLow
        expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.15
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Disk space < 15% remaining"
```

---

## 4.10b Grafana provisioning

### `infra/grafana/datasources/datasource.yml`

```yaml
# infra/grafana/datasources/datasource.yml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

### `infra/grafana/dashboards/dashboard.yml`

```yaml
# infra/grafana/dashboards/dashboard.yml
apiVersion: 1

providers:
  - name: 'GoTipe'
    orgId: 1
    folder: 'GoTipe'
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /etc/grafana/provisioning/dashboards
      foldersFromFilesStructure: false
```

### `infra/grafana/dashboards/gotipe-overview.json`

Grafana dashboard JSON. Основные панели:

```json
{
  "annotations": { "list": [] },
  "editable": true,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 1,
  "id": null,
  "links": [],
  "panels": [
    {
      "title": "Total Documents",
      "type": "stat",
      "gridPos": { "h": 4, "w": 6, "x": 0, "y": 0 },
      "targets": [
        { "expr": "gotipe_documents_total", "refId": "A" }
      ],
      "fieldConfig": {
        "defaults": { "unit": "short", "thresholds": { "steps": [{ "color": "green", "value": null }] } }
      }
    },
    {
      "title": "Active WebSocket Connections",
      "type": "stat",
      "gridPos": { "h": 4, "w": 6, "x": 6, "y": 0 },
      "targets": [
        { "expr": "gotipe_ws_connections", "refId": "A" }
      ],
      "fieldConfig": {
        "defaults": { "unit": "short", "thresholds": { "steps": [
          { "color": "green", "value": null },
          { "color": "yellow", "value": 5000 },
          { "color": "red", "value": 10000 }
        ] } }
      }
    },
    {
      "title": "API Request Rate",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
      "targets": [
        { "expr": "sum(rate(gotipe_api_requests_total[5m])) by (status)", "legendFormat": "{{status}}", "refId": "A" }
      ],
      "fieldConfig": {
        "defaults": { "unit": "reqps" }
      }
    },
    {
      "title": "API Latency Percentiles",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
      "targets": [
        { "expr": "histogram_quantile(0.50, rate(gotipe_api_latency_seconds_bucket[5m]))", "legendFormat": "p50", "refId": "A" },
        { "expr": "histogram_quantile(0.95, rate(gotipe_api_latency_seconds_bucket[5m]))", "legendFormat": "p95", "refId": "B" },
        { "expr": "histogram_quantile(0.99, rate(gotipe_api_latency_seconds_bucket[5m]))", "legendFormat": "p99", "refId": "C" }
      ],
      "fieldConfig": {
        "defaults": { "unit": "s" }
      }
    },
    {
      "title": "AI Requests by Provider",
      "type": "timeseries",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 12 },
      "targets": [
        { "expr": "sum(rate(gotipe_ai_requests_total[5m])) by (provider)", "legendFormat": "{{provider}}", "refId": "A" }
      ]
    },
    {
      "title": "AI Cache Hit Rate",
      "type": "gauge",
      "gridPos": { "h": 8, "w": 6, "x": 12, "y": 12 },
      "targets": [
        { "expr": "rate(gotipe_ai_cache_hits_total[5m]) / (rate(gotipe_ai_cache_hits_total[5m]) + rate(gotipe_ai_cache_misses_total[5m]))", "refId": "A" }
      ],
      "fieldConfig": {
        "defaults": { "unit": "percentunit", "min": 0, "max": 1, "thresholds": { "steps": [
          { "color": "red", "value": null },
          { "color": "yellow", "value": 0.5 },
          { "color": "green", "value": 0.8 }
        ] } }
      }
    },
    {
      "title": "Export Jobs by Status",
      "type": "piechart",
      "gridPos": { "h": 8, "w": 6, "x": 18, "y": 12 },
      "targets": [
        { "expr": "gotipe_export_jobs_by_status", "legendFormat": "{{status}}", "refId": "A" }
      ]
    }
  ],
  "schemaVersion": 39,
  "tags": ["gotipe"],
  "templating": { "list": [] },
  "time": { "from": "now-6h", "to": "now" },
  "title": "GoTipe Overview",
  "uid": "gotipe-overview"
}
```

> Аналогичные dashboard JSON файлы для `gotipe-api.json`, `gotipe-sync.json`, `gotipe-ai.json` — создай по той же схеме с метриками из docs/10-cloud.md (API latency by endpoint, WebSocket messages/sec, room count, CRDT merge latency, AI token usage).

---

## 4.11 `infra/scripts/setup-server.sh`

Полное провижионирование нового сервера.

```bash
#!/bin/bash
# infra/scripts/setup-server.sh — полное провижионирование сервера
set -euo pipefail

REPO="gotipe/gotipe"

echo "=== GoTipe Server Setup ==="

# ─── 1. OS + Docker ───
echo "[1/9] Installing system packages..."
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 fail2ban ufw gh wget curl

# ─── 2. Firewall ───
echo "[2/9] Configuring firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (Caddy redirect)
ufw allow 443/tcp   # HTTPS (Caddy TLS)
ufw --force enable

# ─── 3. Deploy user ───
echo "[3/9] Creating deploy user..."
useradd -m -s /bin/bash deploy || true
usermod -aG docker deploy

# ─── 4. SSH ключ + GitHub авторизация ───
echo "[4/9] Setting up SSH + GitHub..."
sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/id_ed25519 -N ""
gh auth login --with-token <<< "$GITHUB_TOKEN"
gh repo deploy-key add /home/deploy/.ssh/id_ed25519.pub \
   --repo "$REPO" --title "server-$(hostname)"

# ─── 5. Клонируем репу ───
echo "[5/9] Cloning repository..."
sudo -u deploy git clone "git@github.com:${REPO}.git" /opt/gotipe/repo

# ─── 6. Копируем infra/ ───
echo "[6/9] Setting up infra..."
cp -r /opt/gotipe/repo/infra/* /opt/gotipe/
mkdir -p /opt/gotipe/grafana/dashboards /opt/gotipe/grafana/datasources

# ─── 7. GitHub Secrets ───
echo "[7/9] Configuring GitHub Secrets for auto-deploy..."
SERVER_IP=$(curl -s ifconfig.me)
gh secret set DEPLOY_HOST --repo "$REPO" --body "$SERVER_IP"
gh secret set DEPLOY_USER --repo "$REPO" --body "deploy"
gh secret set DEPLOY_KEY --repo "$REPO" --body "$(cat /home/deploy/.ssh/id_ed25519)"

# ─── 8. .env ───
echo "[8/9] Preparing environment..."
if [ ! -f /opt/gotipe/.env ]; then
  cp /opt/gotipe/.env.example /opt/gotipe/.env
  echo ""
  echo "  ⚠  EDIT /opt/gotipe/.env before starting services!"
  echo "     Required: POSTGRES_PASSWORD, JWT keys, R2 credentials, Stripe keys"
  echo ""
fi

# ─── 9. Запуск сервисов ───
echo "[9/9] Starting services..."
cd /opt/gotipe && docker compose up -d

# ─── Бэкапы ───
cp /opt/gotipe/scripts/backup-cron /etc/cron.d/gotipe-backup
chmod 644 /etc/cron.d/gotipe-backup

echo ""
echo "=== Server ready ==="
echo "   IP: ${SERVER_IP}"
echo "   Next push to main → automatic deploy"
echo "   Health: curl https://api.gotipe.com/healthz"
```

---

## 4.12 `infra/scripts/deploy.sh`

Zero-downtime deploy с миграциями.

```bash
#!/bin/bash
# infra/scripts/deploy.sh — Zero-downtime deploy
set -euo pipefail

IMAGE_TAG="${1:-latest}"
COMPOSE="docker compose -f /opt/gotipe/docker-compose.yml"

echo "=== GoTipe Cloud Deploy: ${IMAGE_TAG} ==="

# 1. Pull new images
echo "[1/6] Pulling images..."
$COMPOSE pull api sync export-worker

# 2. Run database migrations BEFORE starting new code
#    Use direct PostgreSQL connection (bypass pgBouncer for DDL)
echo "[2/6] Running migrations..."
$COMPOSE run --rm \
  -e DATABASE_URL="postgres://gotipe:${POSTGRES_PASSWORD}@postgres:5432/gotipe?sslmode=disable" \
  api /gotipe-cloud migrate up

# 3. Scale API to 2 instances (new + old run in parallel)
echo "[3/6] Starting new API container..."
$COMPOSE up -d --no-deps --scale api=2 api

# 4. Wait for new container health check
echo "[4/6] Waiting for health check..."
sleep 5
for i in $(seq 1 12); do
    if $COMPOSE exec api wget -qO- http://localhost:8080/healthz > /dev/null 2>&1; then
        echo "  Health check passed (attempt ${i})"
        break
    fi
    if [ "$i" -eq 12 ]; then
        echo "  ERROR: Health check failed after 60s. Rolling back..."
        $COMPOSE up -d --no-deps --scale api=1 api
        exit 1
    fi
    echo "  Waiting... (attempt ${i}/12)"
    sleep 5
done

# 5. Stop old container, scale back to 1
echo "[5/6] Removing old container..."
OLD_CONTAINER=$(docker ps --filter "name=gotipe-api" --format '{{.ID}}' | tail -1)
if [ -n "$OLD_CONTAINER" ]; then
    docker stop "$OLD_CONTAINER" 2>/dev/null || true
fi
$COMPOSE up -d --no-deps --scale api=1 api

# 6. Update sync + export worker (stateless, restart is safe)
echo "[6/6] Updating sync + export worker..."
$COMPOSE up -d --no-deps sync export-worker

echo ""
echo "=== Deploy complete: ${IMAGE_TAG} ==="
echo "   Health: curl https://api.gotipe.com/healthz"
echo "   Readiness: curl https://api.gotipe.com/readyz"
```

---

## 4.13 `infra/scripts/restore.sh`

Disaster recovery — восстановление PostgreSQL из R2 бэкапа.

```bash
#!/bin/bash
# infra/scripts/restore.sh — восстановление из R2 бэкапа
set -euo pipefail

echo "=== GoTipe Disaster Recovery ==="

PITR_TARGET="${1:-}"  # Optional: "2026-02-10 14:30:00+00"

# 1. Остановить сервисы (если запущены)
echo "[1/7] Stopping services..."
docker compose -f /opt/gotipe/docker-compose.yml down 2>/dev/null || true

# 2. Поднять только PostgreSQL
echo "[2/7] Starting PostgreSQL..."
docker compose -f /opt/gotipe/docker-compose.yml up -d postgres
sleep 10

# 3. Восстановить из pgBackRest (R2)
echo "[3/7] Restoring from pgBackRest..."
if [ -n "$PITR_TARGET" ]; then
    echo "   PITR target: ${PITR_TARGET}"
    docker compose -f /opt/gotipe/docker-compose.yml exec postgres \
        pgbackrest --stanza=gotipe --type=time --target="$PITR_TARGET" restore
else
    docker compose -f /opt/gotipe/docker-compose.yml exec postgres \
        pgbackrest --stanza=gotipe restore
fi

# 4. Перезапустить PostgreSQL для применения recovery
echo "[4/7] Restarting PostgreSQL..."
docker compose -f /opt/gotipe/docker-compose.yml restart postgres
sleep 10

# 5. Проверить целостность
echo "[5/7] Verifying data integrity..."
docker compose -f /opt/gotipe/docker-compose.yml exec postgres \
    psql -U gotipe -c "SELECT COUNT(*) as documents FROM documents;"
docker compose -f /opt/gotipe/docker-compose.yml exec postgres \
    psql -U gotipe -c "SELECT COUNT(*) as users FROM users;"

# 6. Поднять остальные сервисы
echo "[6/7] Starting all services..."
docker compose -f /opt/gotipe/docker-compose.yml up -d

# 7. Health check
echo "[7/7] Verifying health..."
sleep 10
curl -sf http://localhost:8080/healthz && echo "  API: OK" || echo "  API: FAILED"
curl -sf http://localhost:8081/healthz && echo "  Sync: OK" || echo "  Sync: FAILED"

echo ""
echo "=== Recovery complete ==="
echo "   Verify: curl https://api.gotipe.com/readyz"
```

---

## 4.14 `infra/scripts/backup-cron`

Cron schedule для автоматических бэкапов.

```cron
# infra/scripts/backup-cron
# GoTipe — automated PostgreSQL backups via pgBackRest to R2

# WAL archiving — automatic via archive_command in postgresql.conf

# Incremental backup — daily at 03:00 UTC
0 3 * * * deploy docker compose -f /opt/gotipe/docker-compose.yml exec -T postgres pgbackrest --stanza=gotipe --type=incr backup >> /var/log/gotipe-backup.log 2>&1

# Full backup — weekly on Sunday at 04:00 UTC
0 4 * * 0 deploy docker compose -f /opt/gotipe/docker-compose.yml exec -T postgres pgbackrest --stanza=gotipe --type=full backup >> /var/log/gotipe-backup.log 2>&1

# Cleanup old backups — weekly on Monday at 05:00 UTC
0 5 * * 1 deploy docker compose -f /opt/gotipe/docker-compose.yml exec -T postgres pgbackrest --stanza=gotipe expire >> /var/log/gotipe-backup.log 2>&1
```

---

## 4.15 `infra/scripts/rate-limit.lua`

Sliding window rate limiter — атомарный Lua script для Valkey.

```lua
-- infra/scripts/rate-limit.lua
-- Sliding window rate limiter (атомарная операция в Valkey)
--
-- KEYS[1] = rate limit key (e.g. "rl:apikey:gt_live_abc:api")
-- ARGV[1] = limit (max requests per window)
-- ARGV[2] = window (milliseconds)
-- ARGV[3] = now (current timestamp in milliseconds)
--
-- Returns: 1 = allowed, 0 = denied

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local window_start = now - window

-- 1. Remove expired entries outside the window
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- 2. Count current requests in the window
local count = redis.call('ZCARD', key)

if count < limit then
    -- 3. Add current request (score = timestamp, member = unique ID)
    redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
    redis.call('PEXPIRE', key, window)
    return 1  -- allowed
else
    redis.call('PEXPIRE', key, window)
    return 0  -- denied
end
```

---

## 4.16 `scripts/build-wasm.sh`

WASM build + optimize + size check.

```bash
#!/bin/bash
# scripts/build-wasm.sh — Build WASM + optimize + size budget check
set -euo pipefail

WASM_OUT="packages/wasm/pkg"
MAX_GZIP_SIZE=512000  # 500KB gzip budget

echo "=== Building WASM ==="
wasm-pack build crates/gotipe-wasm \
  --target web \
  --out-dir "../../${WASM_OUT}" \
  --release

echo "=== Optimizing WASM ==="
wasm-opt "${WASM_OUT}/gotipe_wasm_bg.wasm" \
  -Oz \
  -o "${WASM_OUT}/gotipe_wasm_bg.wasm"

# Size report
echo "=== WASM Size ==="
RAW_SIZE=$(wc -c < "${WASM_OUT}/gotipe_wasm_bg.wasm")
GZIP_SIZE=$(gzip -c "${WASM_OUT}/gotipe_wasm_bg.wasm" | wc -c)

if command -v numfmt &> /dev/null; then
    echo "  Raw:  $(numfmt --to=iec ${RAW_SIZE})"
    echo "  Gzip: $(numfmt --to=iec ${GZIP_SIZE})"
else
    echo "  Raw:  ${RAW_SIZE} bytes"
    echo "  Gzip: ${GZIP_SIZE} bytes"
fi

# Check size budget
if [ "${GZIP_SIZE}" -gt "${MAX_GZIP_SIZE}" ]; then
  echo "ERROR: WASM gzip size exceeds budget (${GZIP_SIZE} > ${MAX_GZIP_SIZE})"
  exit 1
fi

echo "=== WASM build complete ==="
```

---

## 4.17 `scripts/dev.sh`

Development workflow: rebuild WASM if outdated, start TS dev, optionally start Go server.

```bash
#!/bin/bash
# scripts/dev.sh — Start full development environment
set -euo pipefail

echo "=== GoTipe Dev Environment ==="

# 1. Start infra (Postgres, Valkey, MinIO)
echo "[1/4] Starting dev infrastructure..."
docker compose -f infra/docker-compose.dev.yml up -d

# 2. Build WASM (if Rust sources changed)
echo "[2/4] Checking WASM..."
WASM_FILE="packages/wasm/pkg/gotipe_wasm_bg.wasm"
RUST_CHANGED=false

if [ ! -f "$WASM_FILE" ]; then
    RUST_CHANGED=true
elif [ "$(find crates/ -name '*.rs' -newer "$WASM_FILE" | head -1)" ]; then
    RUST_CHANGED=true
fi

if [ "$RUST_CHANGED" = true ]; then
    echo "  WASM outdated, rebuilding..."
    bash scripts/build-wasm.sh
else
    echo "  WASM up to date"
fi

# 3. Start TypeScript packages in watch mode
echo "[3/4] Starting TypeScript dev server..."
pnpm turbo run dev &
TS_PID=$!

# 4. Start Go server (if cloud/ exists and developing cloud features)
GO_PID=""
if [ -f apps/cloud/go.mod ]; then
    echo "[4/4] Starting Go API server..."
    (cd apps/cloud && go run ./cmd/api) &
    GO_PID=$!
else
    echo "[4/4] Skipping Go server (no apps/cloud/go.mod)"
fi

# Cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down..."
    [ -n "$TS_PID" ] && kill "$TS_PID" 2>/dev/null || true
    [ -n "$GO_PID" ] && kill "$GO_PID" 2>/dev/null || true
    echo "Done."
}
trap cleanup EXIT INT TERM

echo ""
echo "=== Dev environment running ==="
echo "   Playground: http://localhost:5173"
echo "   API:        http://localhost:8080"
echo "   MinIO:      http://localhost:9001 (minioadmin/minioadmin)"
echo ""

wait
```

---

## Верификация

После создания всех файлов:

```bash
# 1. Dev infrastructure starts
docker compose -f infra/docker-compose.dev.yml up -d
curl -sf http://localhost:5432 || echo "Postgres: running (connection refused = OK, pg_isready check)"
docker compose -f infra/docker-compose.dev.yml exec valkey valkey-cli ping  # → PONG
curl -sf http://localhost:9001  # MinIO console

# 2. Production compose validates
docker compose -f infra/docker-compose.yml config --quiet  # No errors

# 3. Scripts are executable
chmod +x infra/scripts/*.sh scripts/*.sh

# 4. Lua script syntax
# Load in Valkey: docker compose -f infra/docker-compose.dev.yml exec valkey valkey-cli SCRIPT LOAD "$(cat infra/scripts/rate-limit.lua)"

# 5. Caddyfile validates (if caddy installed locally)
# caddy validate --config infra/Caddyfile
```

---

## Подсказки

1. **pgBouncer:** Приложение подключается к `pgbouncer:6432`. Миграции в `deploy.sh` подключаются напрямую к `postgres:5432` (DDL operations не совместимы с transaction pooling)
2. **Valkey DB isolation:** Приложение использует `SELECT 0` для cache и `SELECT 1` для JWT blocklist. Нельзя полагаться на per-DB eviction policy Valkey — контроль на уровне приложения
3. **Grafana provisioning:** Dashboards загружаются автоматически из JSON файлов через volume mount. Datasource привязан к Prometheus
4. **Backup тестирование:** После первого deploy обязательно протестируй `restore.sh` на staging-сервере
5. **Docker networking:** Production использует две сети: `frontend` (Caddy ↔ API/Sync) и `backend` (все сервисы). Postgres и Valkey не exposed наружу
6. **Rate limit Lua:** Script загружается один раз через `SCRIPT LOAD`, далее вызывается через `EVALSHA` (быстрее чем `EVAL`)
