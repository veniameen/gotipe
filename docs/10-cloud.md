# GoTipe Cloud

## Обзор

GoTipe Cloud — managed backend для GoTipe editor: collaboration sync, AI proxy, document export, analytics. Open-source ядро работает без облака. Cloud — опциональная инфраструктура для тех, кто не хочет деплоить свой backend.

Ключевые отличия от Tiptap Cloud:
- Цена за документ в 2-3x ниже
- AI proxy и export включены в тариф (у Tiptap — отдельно или отсутствуют)
- Self-hosted вариант: Hetzner VDS + Docker Compose + Cloudflare R2 (~EUR 8/mo)

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            CLIENTS                                       │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐   │
│  │ Browser  │  │ Browser  │  │  Node.js  │  │  Go/Python backend  │   │
│  │ (WASM)   │  │ (WASM)   │  │  (WASM)   │  │  (REST API client)  │   │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └──────────┬──────────┘   │
│       │              │              │                    │               │
└───────┼──────────────┼──────────────┼────────────────────┼───────────────┘
        │ WebSocket    │ WebSocket    │ REST               │ REST
        ▼              ▼              ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         GOTIPE CLOUD                                     │
│                                                                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  API Gateway     │  │  WebSocket       │  │  Export Service      │  │
│  │  (Go, net/http)  │  │  Sync Server     │  │  (Rust, queue-based) │  │
│  │                  │  │  (Go, gorilla/ws) │  │                      │  │
│  │  REST API        │  │  CRDT merge      │  │  PDF (typst)         │  │
│  │  Auth middleware  │  │  Room management │  │  DOCX (docx-rs)      │  │
│  │  Rate limiting   │  │  Persistence     │  │  Markdown / HTML     │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────┬───────────┘  │
│           │                     │                        │              │
│  ┌────────┴─────────┐          │              ┌──────────┴───────────┐  │
│  │  AI Proxy        │          │              │  Analytics Service   │  │
│  │  (Go)            │          │              │  (Go)                │  │
│  │                  │          │              │                      │  │
│  │  OpenAI          │          │              │  Usage metrics       │  │
│  │  Anthropic       │          │              │  Collaboration stats │  │
│  │  Gemini          │          │              │  Prometheus export   │  │
│  │  Rate limit      │          │              │                      │  │
│  │  Response cache  │          │              │                      │  │
│  │  SSE streaming   │          │              │                      │  │
│  └────────┬─────────┘          │              └──────────┬───────────┘  │
│           │                     │                        │              │
│           ▼                     ▼                        ▼              │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                       Storage Layer                               │   │
│  │                                                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │   │
│  │  │ PostgreSQL   │  │    Valkey    │  │  Cloudflare R2         │ │   │
│  │  │              │  │   (Redis)    │  │  (S3-compatible)       │ │   │
│  │  │ documents    │  │              │  │                        │ │   │
│  │  │ users        │  │ session cache│  │ CRDT snapshots         │ │   │
│  │  │ api_keys     │  │ rate limits  │  │ exported files (PDF…)  │ │   │
│  │  │ usage_logs   │  │ AI cache    │  │ file attachments       │ │   │
│  │  │ exports queue│  │ pubsub      │  │ backups (pgBackRest)   │ │   │
│  │  └──────────────┘  └──────────────┘  └────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Сервисы

### 1. Collaboration — WebSocket Sync

Sync server принимает WebSocket-соединения, мёрджит CRDT updates, рассылает изменения всем участникам документа, персистит state в PostgreSQL + Cloudflare R2.

Подробности sync protocol, CRDT engine и awareness — в [02-collaboration.md](02-collaboration.md).

Ответственность Cloud-слоя:
- Authentication на WebSocket handshake (API key или JWT)
- Room management (создание/удаление rooms, лимиты concurrent users)
- Scheduled compaction (merge incremental updates в snapshot каждые N updates)
- Document history (хранение snapshots с версионированием)

### 2. AI Proxy

LLM proxy — единая точка доступа к AI providers. Клиент отправляет запрос в GoTipe Cloud, Cloud маршрутизирует в нужный provider.

Подробности AI integration, ghost text и commands — в [07-ai.md](07-ai.md).

```
Client ──► GoTipe AI Proxy ──┬──► OpenAI (gpt-4o, gpt-4o-mini)
                              ├──► Anthropic (claude-sonnet-4, claude-haiku)
                              └──► Google (gemini-2.0-flash)
```

Функции proxy:
- **Rate limiting** — per API key, per user, per provider
- **Response caching** — Valkey, TTL по типу запроса (suggestions = 5min, rewrite = 1h)
- **Streaming** — SSE relay от provider к клиенту
- **Fallback** — при недоступности primary provider, автоматический switch на secondary
- **Cost tracking** — подсчёт token usage per customer

### 3. Export Service

Queue-based сервис для генерации PDF и DOCX. Использует Rust WASM core (typst для PDF, docx-rs для DOCX).

Подробности export форматов — в [08-export-import.md](08-export-import.md).

```
Client ── POST /api/v1/exports ──► API Gateway ──► PostgreSQL (queue)
                                                        │
                                                        ▼
                                                  Export Worker
                                                  (Rust binary)
                                                        │
                                                        ▼
                                                  R2 (result file)
                                                        │
Client ◄── GET /api/v1/exports/:id ◄── 302 redirect ───┘
```

| Формат | Engine | Время (100 блоков) | Client-side fallback |
|--------|--------|--------------------|----------------------|
| PDF | typst (Rust) | ~500ms | Нет |
| DOCX | docx-rs (Rust) | ~300ms | Нет |
| HTML | gotipe-export (WASM) | ~5ms | Да |
| Markdown | gotipe-export (WASM) | ~3ms | Да |

### 4. Analytics

Сбор метрик использования: активные документы, collaboration sessions, AI requests, export jobs.

| Метрика | Тип | Описание |
|---------|-----|----------|
| `gotipe_documents_total` | Counter | Общее количество документов |
| `gotipe_documents_active` | Gauge | Документы с активными WebSocket-соединениями |
| `gotipe_ws_connections` | Gauge | Текущие WebSocket-соединения |
| `gotipe_ws_messages_total` | Counter | Всего WebSocket-сообщений (sync + awareness) |
| `gotipe_ai_requests_total` | Counter | AI proxy запросы по provider / model |
| `gotipe_ai_tokens_total` | Counter | Token usage (input + output) |
| `gotipe_exports_total` | Counter | Export jobs по формату |
| `gotipe_exports_duration_seconds` | Histogram | Время генерации export |
| `gotipe_api_requests_total` | Counter | REST API запросы по endpoint / status |
| `gotipe_api_latency_seconds` | Histogram | REST API latency |

---

## PostgreSQL Schema

```sql
-- ============================================================
-- GoTipe Cloud — Database Schema
-- ============================================================

-- Пользователи (владельцы аккаунтов)
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL DEFAULT '',
    password_hash   TEXT,                             -- NULL для OAuth-only
    oauth_provider  TEXT,                             -- 'github', 'google', NULL
    oauth_id        TEXT,
    plan            TEXT NOT NULL DEFAULT 'starter',  -- starter, pro, business, enterprise
    stripe_customer_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL;

-- API ключи для server-to-server аутентификации
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT '',
    key_hash        TEXT NOT NULL,                    -- SHA-256 hash ключа
    key_prefix      TEXT NOT NULL,                    -- первые 8 символов (для display)
    scopes          TEXT[] NOT NULL DEFAULT '{}',     -- 'documents', 'ai', 'export', 'admin'
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- Документы
CREATE TABLE documents (
    id              TEXT PRIMARY KEY,                 -- client-generated ID (nanoid)
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT '',
    version         BIGINT NOT NULL DEFAULT 0,
    r2_snapshot_key TEXT,                             -- ключ последнего CRDT snapshot в R2
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    collaborators   JSONB NOT NULL DEFAULT '[]',     -- [{user_id, role, added_at}]
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_documents_updated ON documents(updated_at DESC);

-- Incremental CRDT updates (compacted в snapshot периодически)
CREATE TABLE document_updates (
    id              BIGSERIAL PRIMARY KEY,
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    data            BYTEA NOT NULL,                  -- binary CRDT update
    peer_id         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_updates_doc ON document_updates(document_id, id);

-- Версионные snapshots документов
CREATE TABLE document_snapshots (
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version         BIGINT NOT NULL,
    r2_key          TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    peer_id         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, version)
);

-- Очередь задач на export
CREATE TABLE export_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    format          TEXT NOT NULL,                    -- 'pdf', 'docx', 'html', 'md'
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    r2_result_key   TEXT,                             -- ключ результата в R2
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_export_jobs_status ON export_jobs(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_export_jobs_user ON export_jobs(user_id, created_at DESC);

-- Логи использования (для billing и analytics)
CREATE TABLE usage_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,                    -- 'ai_request', 'export', 'ws_connect', 'api_call'
    metadata        JSONB NOT NULL DEFAULT '{}',     -- {model, tokens_in, tokens_out, format, ...}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_logs_user_type ON usage_logs(user_id, event_type, created_at DESC);

-- Partitioning usage_logs по месяцам (для production)
-- CREATE TABLE usage_logs (...) PARTITION BY RANGE (created_at);
```

---

## REST API

Base URL: `https://api.gotipe.com/v1`

Все запросы требуют header `Authorization: Bearer <api_key>` или `Authorization: Bearer <jwt_token>`.

### Documents CRUD

#### `POST /api/v1/documents` — создание документа

```bash
curl -X POST https://api.gotipe.com/v1/documents \
  -H "Authorization: Bearer gt_live_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "id": "doc_k7x9m2",
    "title": "Project Spec",
    "content": {
      "version": 1,
      "blocks": [
        {
          "id": "b1",
          "type": "heading",
          "attrs": {"level": 1},
          "content": [{"text": "Project Spec", "marks": []}],
          "children": []
        }
      ]
    }
  }'
```

Response `201 Created`:
```json
{
  "id": "doc_k7x9m2",
  "title": "Project Spec",
  "version": 1,
  "size_bytes": 342,
  "created_at": "2026-02-09T12:00:00Z",
  "updated_at": "2026-02-09T12:00:00Z",
  "sync_url": "wss://sync.gotipe.com/ws/doc_k7x9m2"
}
```

#### `GET /api/v1/documents/:id` — получение документа

```bash
curl https://api.gotipe.com/v1/documents/doc_k7x9m2 \
  -H "Authorization: Bearer gt_live_abc123..."
```

Response `200 OK`:
```json
{
  "id": "doc_k7x9m2",
  "title": "Project Spec",
  "version": 42,
  "size_bytes": 15230,
  "content": {
    "version": 42,
    "blocks": [...]
  },
  "collaborators": [
    {"user_id": "usr_1", "role": "editor", "added_at": "2026-02-09T12:00:00Z"}
  ],
  "created_at": "2026-02-09T12:00:00Z",
  "updated_at": "2026-02-09T14:30:00Z"
}
```

#### `GET /api/v1/documents` — список документов

```bash
curl "https://api.gotipe.com/v1/documents?limit=20&offset=0&sort=updated_at:desc" \
  -H "Authorization: Bearer gt_live_abc123..."
```

Response `200 OK`:
```json
{
  "data": [
    {"id": "doc_k7x9m2", "title": "Project Spec", "version": 42, "updated_at": "..."},
    {"id": "doc_m3p8q1", "title": "Meeting Notes", "version": 7, "updated_at": "..."}
  ],
  "total": 156,
  "limit": 20,
  "offset": 0
}
```

#### `DELETE /api/v1/documents/:id` — удаление документа

```bash
curl -X DELETE https://api.gotipe.com/v1/documents/doc_k7x9m2 \
  -H "Authorization: Bearer gt_live_abc123..."
```

Response `204 No Content`.

### Users

#### `GET /api/v1/users/me` — текущий пользователь

```bash
curl https://api.gotipe.com/v1/users/me \
  -H "Authorization: Bearer gt_live_abc123..."
```

Response `200 OK`:
```json
{
  "id": "usr_1",
  "email": "dev@example.com",
  "name": "Developer",
  "plan": "pro",
  "usage": {
    "documents": 847,
    "documents_limit": 10000,
    "ai_requests": 23451,
    "ai_requests_limit": 100000,
    "exports": 312,
    "exports_limit": -1
  }
}
```

### API Keys

#### `POST /api/v1/api-keys` — создание API key

```bash
curl -X POST https://api.gotipe.com/v1/api-keys \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Backend",
    "scopes": ["documents", "ai", "export"]
  }'
```

Response `201 Created`:
```json
{
  "id": "key_x9k2m",
  "name": "Production Backend",
  "key": "gt_live_sk_7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c",
  "key_prefix": "gt_live_",
  "scopes": ["documents", "ai", "export"],
  "created_at": "2026-02-09T12:00:00Z"
}
```

> `key` возвращается **только один раз** при создании. Хранить на стороне клиента.

### Export

#### `POST /api/v1/exports` — создание export job

```bash
curl -X POST https://api.gotipe.com/v1/exports \
  -H "Authorization: Bearer gt_live_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "document_id": "doc_k7x9m2",
    "format": "pdf"
  }'
```

Response `202 Accepted`:
```json
{
  "id": "exp_q8w2e",
  "document_id": "doc_k7x9m2",
  "format": "pdf",
  "status": "pending",
  "created_at": "2026-02-09T14:30:00Z"
}
```

#### `GET /api/v1/exports/:id` — статус / download

Пока `status == "pending"` или `"processing"` — возвращает JSON со статусом.
При `status == "completed"` — 302 redirect на R2 presigned URL.

```bash
curl -L https://api.gotipe.com/v1/exports/exp_q8w2e \
  -H "Authorization: Bearer gt_live_abc123..." \
  -o document.pdf
```

### AI Proxy

#### `POST /api/v1/ai/complete` — completion request

```bash
curl -X POST https://api.gotipe.com/v1/ai/complete \
  -H "Authorization: Bearer gt_live_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-4o-mini",
    "document_context": {
      "blocks_before": [...],
      "blocks_after": [...],
      "selection": "selected text here"
    },
    "command": "rewrite",
    "prompt": "Make it more concise",
    "stream": true
  }'
```

Response (SSE stream):
```
data: {"delta": "Here is", "done": false}
data: {"delta": " a concise", "done": false}
data: {"delta": " version.", "done": false}
data: {"delta": "", "done": true, "usage": {"input_tokens": 245, "output_tokens": 12}}
```

---

## WebSocket API

### Endpoint

```
wss://sync.gotipe.com/ws/:documentId?token=<jwt_or_api_key>&peerId=<peer_id>
```

### Auth Handshake

```
Client                                          Server
  │                                                │
  │── WS Connect ─────────────────────────────────►│
  │   wss://sync.gotipe.com/ws/doc_k7x9m2         │
  │   ?token=gt_live_abc123&peerId=peer_1          │
  │                                                │
  │                              ┌─────────────────┤
  │                              │ Validate token   │
  │                              │ Check doc access  │
  │                              │ Check plan limits │
  │                              └─────────────────┤
  │                                                │
  │◄── Auth OK (0x08) ────────────────────────────│
  │    {status: "ok", room_peers: ["peer_2"]}     │
  │                                                │
  │── SyncStep1 (0x01) ──────────────────────────►│
  │   [local version vector]                       │
  │                                                │
  │◄── SyncStep2 (0x02) ──────────────────────────│
  │   [missing updates since client version]       │
  │                                                │
  │◄─► Awareness (0x04) ─────────────────────────►│
  │   [cursor, selection, user info]               │
  │                                                │
  │     ─── synchronized, bidirectional ───        │
  │                                                │
  │── Update (0x03) ─────────────────────────────►│
  │◄── Update (0x03) ─────────────────────────────│
```

### Binary Message Format

```
┌──────────┬──────────┬──────────────┬──────────────────┐
│ Type (1B)│ Flags(1B)│ Length (4B)  │ Payload (var)    │
└──────────┴──────────┴──────────────┴──────────────────┘

Type:
  0x01 = SyncStep1 (version vector)
  0x02 = SyncStep2 (missing updates)
  0x03 = Update (incremental CRDT ops)
  0x04 = Awareness (presence, cursors)
  0x05 = AwarenessQuery
  0x06 = Snapshot (full document state)
  0x07 = SnapshotRequest
  0x08 = Auth (handshake result)
  0x09 = Error

Flags:
  bit 0 = compressed (zstd)
  bit 1 = requires ACK
  bit 2 = is response
```

### Error Codes

| Code | Message | Описание |
|------|---------|----------|
| `4001` | `auth_failed` | Невалидный token или API key |
| `4002` | `document_not_found` | Документ не существует |
| `4003` | `plan_limit_reached` | Превышен лимит документов плана |
| `4004` | `room_full` | Превышен лимит concurrent users для документа |
| `4005` | `rate_limited` | Слишком много сообщений |

---

## Аутентификация

### Три механизма

| Механизм | Где используется | Формат |
|----------|-----------------|--------|
| **API Key** | Server-to-server, REST API, WebSocket | `Authorization: Bearer gt_live_...` |
| **JWT** | Client-side, short-lived | `Authorization: Bearer eyJhbG...` |
| **OAuth 2.0** | Dashboard login | GitHub, Google providers |

### API Key

Формат: `gt_live_sk_<32 hex chars>` (production) или `gt_test_sk_<32 hex chars>` (test).

```go
// apps/cloud/api/middleware/auth.go
package middleware

import (
    "crypto/sha256"
    "encoding/hex"
    "net/http"
    "strings"
)

func AuthMiddleware(db *sql.DB) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
            if token == "" {
                http.Error(w, `{"error":"missing_token"}`, http.StatusUnauthorized)
                return
            }

            // API Key path
            if strings.HasPrefix(token, "gt_") {
                hash := sha256.Sum256([]byte(token))
                keyHash := hex.EncodeToString(hash[:])

                var userID, plan string
                var scopes []string
                err := db.QueryRowContext(r.Context(),
                    `SELECT u.id, u.plan, k.scopes
                     FROM api_keys k JOIN users u ON k.user_id = u.id
                     WHERE k.key_hash = $1 AND (k.expires_at IS NULL OR k.expires_at > now())`,
                    keyHash,
                ).Scan(&userID, &plan, pq.Array(&scopes))

                if err != nil {
                    http.Error(w, `{"error":"invalid_api_key"}`, http.StatusUnauthorized)
                    return
                }

                ctx := WithUser(r.Context(), userID, plan, scopes)
                next.ServeHTTP(w, r.WithContext(ctx))
                return
            }

            // JWT path
            claims, err := validateJWT(token)
            if err != nil {
                http.Error(w, `{"error":"invalid_token"}`, http.StatusUnauthorized)
                return
            }

            ctx := WithUser(r.Context(), claims.UserID, claims.Plan, claims.Scopes)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

### JWT Generation (для client-side)

```bash
# Клиент запрашивает JWT через server-side endpoint
curl -X POST https://api.gotipe.com/v1/auth/token \
  -H "Authorization: Bearer gt_live_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_42",
    "document_ids": ["doc_k7x9m2", "doc_m3p8q1"],
    "scopes": ["documents:read", "documents:write", "sync"],
    "expires_in": 3600
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJFZERTQSIs...",
  "expires_at": "2026-02-09T15:30:00Z"
}
```

JWT payload:
```json
{
  "sub": "user_42",
  "iss": "gotipe",
  "aud": "gotipe-cloud",
  "iat": 1739102400,
  "exp": 1739106000,
  "scopes": ["documents:read", "documents:write", "sync"],
  "document_ids": ["doc_k7x9m2", "doc_m3p8q1"],
  "plan": "pro"
}
```

---

## Go API Server — примеры endpoints

```go
// apps/cloud/api/main.go
package main

import (
    "log/slog"
    "net/http"
    "os"

    "github.com/gotipe/cloud/api/handler"
    "github.com/gotipe/cloud/api/middleware"
)

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
    db := mustConnectDB()
    r2 := mustConnectR2()
    valkey := mustConnectValkey()

    mux := http.NewServeMux()

    // Health
    mux.HandleFunc("GET /healthz", handler.Healthz(db, valkey))
    mux.HandleFunc("GET /readyz", handler.Readyz(db, valkey, r2))

    // Auth
    auth := middleware.AuthMiddleware(db)
    rate := middleware.RateLimiter(valkey)

    // Documents
    mux.Handle("POST /api/v1/documents", auth(rate(handler.CreateDocument(db, r2))))
    mux.Handle("GET /api/v1/documents", auth(rate(handler.ListDocuments(db))))
    mux.Handle("GET /api/v1/documents/{id}", auth(rate(handler.GetDocument(db, r2))))
    mux.Handle("DELETE /api/v1/documents/{id}", auth(rate(handler.DeleteDocument(db, r2))))

    // Users
    mux.Handle("GET /api/v1/users/me", auth(handler.GetCurrentUser(db)))

    // API Keys
    mux.Handle("POST /api/v1/api-keys", auth(handler.CreateAPIKey(db)))
    mux.Handle("GET /api/v1/api-keys", auth(handler.ListAPIKeys(db)))
    mux.Handle("DELETE /api/v1/api-keys/{id}", auth(handler.DeleteAPIKey(db)))

    // Export
    mux.Handle("POST /api/v1/exports", auth(rate(handler.CreateExport(db))))
    mux.Handle("GET /api/v1/exports/{id}", auth(handler.GetExport(db, r2)))

    // AI Proxy
    mux.Handle("POST /api/v1/ai/complete", auth(rate(handler.AIComplete(valkey))))

    // Auth token
    mux.Handle("POST /api/v1/auth/token", auth(handler.CreateToken(db)))

    // Prometheus metrics
    mux.Handle("GET /metrics", handler.Metrics())

    addr := envOrDefault("LISTEN_ADDR", ":8080")
    logger.Info("starting API server", "addr", addr)
    http.ListenAndServe(addr, mux)
}
```

### Document Handler (пример)

```go
// apps/cloud/api/handler/documents.go
package handler

import (
    "encoding/json"
    "net/http"

    "github.com/gotipe/cloud/api/middleware"
)

type CreateDocumentRequest struct {
    ID      string          `json:"id"`
    Title   string          `json:"title"`
    Content json.RawMessage `json:"content"`
}

type DocumentResponse struct {
    ID        string `json:"id"`
    Title     string `json:"title"`
    Version   int64  `json:"version"`
    SizeBytes int64  `json:"size_bytes"`
    SyncURL   string `json:"sync_url"`
    CreatedAt string `json:"created_at"`
    UpdatedAt string `json:"updated_at"`
}

func CreateDocument(db *sql.DB, r2 R2Client) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        user := middleware.UserFromContext(r.Context())

        // Check plan limits
        var docCount int64
        db.QueryRowContext(r.Context(),
            `SELECT COUNT(*) FROM documents WHERE user_id = $1`, user.ID,
        ).Scan(&docCount)

        limit := planDocumentLimit(user.Plan)
        if docCount >= limit {
            writeJSON(w, http.StatusForbidden, map[string]string{
                "error":   "plan_limit_reached",
                "message": "Document limit reached for your plan",
            })
            return
        }

        var req CreateDocumentRequest
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
            return
        }

        // Store initial content as CRDT snapshot in R2
        r2Key := "snapshots/" + req.ID + "/v1"
        crdtState := contentToCRDT(req.Content)
        if err := r2.Put(r.Context(), r2Key, crdtState); err != nil {
            writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "storage_error"})
            return
        }

        // Insert metadata
        _, err := db.ExecContext(r.Context(),
            `INSERT INTO documents (id, user_id, title, version, r2_snapshot_key, size_bytes)
             VALUES ($1, $2, $3, 1, $4, $5)`,
            req.ID, user.ID, req.Title, r2Key, len(crdtState),
        )
        if err != nil {
            writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "db_error"})
            return
        }

        // Log usage
        logUsage(db, user.ID, "document_create", nil)

        writeJSON(w, http.StatusCreated, DocumentResponse{
            ID:      req.ID,
            Title:   req.Title,
            Version: 1,
            SyncURL: "wss://sync.gotipe.com/ws/" + req.ID,
        })
    }
}

func planDocumentLimit(plan string) int64 {
    switch plan {
    case "starter":    return 1_000
    case "pro":        return 10_000
    case "business":   return 100_000
    case "enterprise": return 1_000_000  // soft limit
    default:           return 100        // free/trial
    }
}
```

---

## Environment Variables

```bash
# ============================================================
# GoTipe Cloud — Environment Configuration
# ============================================================

# --- Server ---
LISTEN_ADDR=:8080                    # API server address
SYNC_LISTEN_ADDR=:8081               # WebSocket sync server address
METRICS_LISTEN_ADDR=:9090            # Prometheus metrics endpoint

# --- PostgreSQL ---
DATABASE_URL=postgres://gotipe:secret@localhost:5432/gotipe?sslmode=disable
DATABASE_MAX_CONNS=50
DATABASE_IDLE_CONNS=10

# --- Valkey (Redis-compatible) ---
VALKEY_URL=redis://localhost:6379/0
VALKEY_PASSWORD=
VALKEY_MAX_CONNS=20

# --- Cloudflare R2 (Production) ---
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET=gotipe-data
R2_CDN_URL=https://cdn.gotipe.com    # R2 public bucket custom domain

# --- MinIO (Local Development Only) ---
# S3_ENDPOINT=http://localhost:9000
# S3_BUCKET=gotipe-data
# S3_ACCESS_KEY=minioadmin
# S3_SECRET_KEY=minioadmin
# S3_USE_PATH_STYLE=true

# --- Auth ---
JWT_SECRET=your-256-bit-secret-key-here
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

# --- Monitoring ---
PROMETHEUS_ENABLED=true
LOG_LEVEL=info                        # debug, info, warn, error
LOG_FORMAT=json                       # json, text
```

---

## Self-Hosted Deployment

### Docker Compose (Production)

Production-стек использует Cloudflare R2 для object storage (zero egress, встроенный CDN), Caddy как reverse proxy с auto TLS, Hetzner VDS как хостинг.

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
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      api:
        condition: service_healthy
      sync:
        condition: service_healthy
    restart: always

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
    depends_on:
      pgbouncer:
        condition: service_started
      valkey:
        condition: service_healthy
    restart: always
    stop_grace_period: 35s
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/healthz"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s

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
    depends_on:
      pgbouncer:
        condition: service_started
      valkey:
        condition: service_healthy
    restart: always
    stop_grace_period: 35s
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8081/healthz"]
      interval: 10s
      timeout: 5s
      retries: 3

  # --- Export Worker ---
  export-worker:
    image: ghcr.io/gotipe/cloud-export:latest
    env_file: .env
    environment:
      DATABASE_URL: "postgres://gotipe:${POSTGRES_PASSWORD}@pgbouncer:6432/gotipe?sslmode=disable"
      EXPORT_WORKERS: "4"
      EXPORT_POLL_INTERVAL: "1s"
    depends_on:
      pgbouncer:
        condition: service_started
    restart: always

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
    expose:
      - "6432"
    depends_on:
      postgres:
        condition: service_healthy
    restart: always

  # --- PostgreSQL ---
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: gotipe
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
      POSTGRES_DB: gotipe
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gotipe"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: always

  # --- Valkey (Redis-compatible) ---
  valkey:
    image: valkey/valkey:8-alpine
    volumes:
      - valkey_data:/data
      - ./valkey/valkey.conf:/etc/valkey/valkey.conf
    command: valkey-server /etc/valkey/valkey.conf
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: always

  # --- Prometheus (optional) ---
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    profiles:
      - monitoring

  # --- Grafana (optional) ---
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    profiles:
      - monitoring

volumes:
  postgres_data:
  valkey_data:
  caddy_data:
  caddy_config:
```

> **Production использует Cloudflare R2** — object storage не требует отдельного контейнера. R2 credentials передаются через `.env` (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY). MinIO используется только для локальной разработки.

### Caddyfile (Reverse Proxy + Auto TLS)

```
# infra/Caddyfile
api.gotipe.com {
    reverse_proxy api:8080
}

sync.gotipe.com {
    reverse_proxy sync:8081
}
```

Caddy автоматически получает и обновляет TLS-сертификаты через Let's Encrypt. Минимальный конфиг — 6 строк.

### Docker Compose (Local Development)

Для локальной разработки MinIO заменяет R2, порты открыты напрямую:

```yaml
# docker-compose.dev.yml (Local Development)
services:
  api:
    image: ghcr.io/gotipe/cloud-api:latest
    ports:
      - "8080:8080"
    environment:
      LISTEN_ADDR: ":8080"
      DATABASE_URL: "postgres://gotipe:gotipe@postgres:5432/gotipe?sslmode=disable"
      VALKEY_URL: "redis://valkey:6379/0"
      S3_ENDPOINT: "http://minio:9000"
      S3_BUCKET: "gotipe-data"
      S3_ACCESS_KEY: "minioadmin"
      S3_SECRET_KEY: "minioadmin"
      S3_USE_PATH_STYLE: "true"
      JWT_SECRET: "dev-secret-change-in-production"
    depends_on:
      postgres: { condition: service_healthy }
      valkey: { condition: service_healthy }
      minio: { condition: service_started }

  sync:
    image: ghcr.io/gotipe/cloud-sync:latest
    ports:
      - "8081:8081"
    environment:
      SYNC_LISTEN_ADDR: ":8081"
      DATABASE_URL: "postgres://gotipe:gotipe@postgres:5432/gotipe?sslmode=disable"
      VALKEY_URL: "redis://valkey:6379/0"
      S3_ENDPOINT: "http://minio:9000"
      S3_BUCKET: "gotipe-data"
      S3_ACCESS_KEY: "minioadmin"
      S3_SECRET_KEY: "minioadmin"
      S3_USE_PATH_STYLE: "true"
      JWT_SECRET: "dev-secret-change-in-production"
    depends_on:
      postgres: { condition: service_healthy }
      valkey: { condition: service_healthy }

  postgres:
    image: postgres:17-alpine
    ports: ["5432:5432"]
    environment: { POSTGRES_USER: gotipe, POSTGRES_PASSWORD: gotipe, POSTGRES_DB: gotipe }
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gotipe"]
      interval: 5s
      timeout: 3s
      retries: 5

  valkey:
    image: valkey/valkey:8-alpine
    ports: ["6379:6379"]
    volumes: [valkey_data:/data]
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    ports: ["9000:9000", "9001:9001"]
    environment: { MINIO_ROOT_USER: minioadmin, MINIO_ROOT_PASSWORD: minioadmin }
    volumes: [minio_data:/data]
    command: server /data --console-address ":9001"

  minio-init:
    image: minio/mc:latest
    depends_on: [minio]
    entrypoint: >
      /bin/sh -c "
        sleep 3;
        mc alias set local http://minio:9000 minioadmin minioadmin;
        mc mb local/gotipe-data --ignore-existing;
        exit 0;
      "

volumes:
  postgres_data:
  valkey_data:
  minio_data:
```

### Запуск

```bash
# Production (Hetzner VDS)
cd /opt/gotipe && docker compose up -d

# С Prometheus + Grafana
docker compose --profile monitoring up -d

# Local Development
docker compose -f docker-compose.dev.yml up -d

# Проверка
curl http://localhost:8080/healthz
curl http://localhost:8081/healthz
```

### Single Binary

Для случаев, когда Docker не подходит. Все сервисы (API + Sync + Export worker) в одном binary.

```bash
# Download
curl -L https://github.com/gotipe/cloud/releases/latest/download/gotipe-cloud-$(uname -s)-$(uname -m) \
  -o gotipe-cloud && chmod +x gotipe-cloud

# Run (requires external PostgreSQL, Valkey, R2 credentials)
export DATABASE_URL="postgres://gotipe:secret@localhost:5432/gotipe"
export VALKEY_URL="redis://localhost:6379/0"
export R2_ACCOUNT_ID="your-cloudflare-account-id"
export R2_ACCESS_KEY_ID="your-r2-access-key"
export R2_SECRET_ACCESS_KEY="your-r2-secret-key"
export R2_BUCKET="gotipe-data"
export JWT_SECRET="your-secret-key"

./gotipe-cloud serve
```

### Helm Chart (Kubernetes)

```bash
helm repo add gotipe https://charts.gotipe.com
helm repo update

helm install gotipe-cloud gotipe/gotipe-cloud \
  --namespace gotipe \
  --create-namespace \
  --set postgresql.enabled=true \
  --set valkey.enabled=true \
  --set r2.accountId="your-cf-account-id" \
  --set api.replicas=2 \
  --set sync.replicas=3 \
  --set export.workers=4 \
  --set auth.jwtSecret="your-secret-key" \
  --set ai.openaiKey="sk-..."
```

`values.yaml` (основные параметры):
```yaml
api:
  replicas: 2
  resources:
    requests: { cpu: 250m, memory: 256Mi }
    limits:   { cpu: 1000m, memory: 512Mi }

sync:
  replicas: 3
  resources:
    requests: { cpu: 500m, memory: 512Mi }
    limits:   { cpu: 2000m, memory: 2Gi }

export:
  workers: 4
  resources:
    requests: { cpu: 500m, memory: 512Mi }
    limits:   { cpu: 2000m, memory: 2Gi }

postgresql:
  enabled: true                # false если внешний PostgreSQL
  auth:
    postgresPassword: gotipe
    database: gotipe

valkey:
  enabled: true
  architecture: standalone     # или replication для HA

r2:
  accountId: ""               # Cloudflare Account ID
  accessKeyId: ""
  secretAccessKey: ""
  bucket: gotipe-data

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: api.gotipe.example.com
      paths: [{ path: /, pathType: Prefix, service: api }]
    - host: sync.gotipe.example.com
      paths: [{ path: /, pathType: Prefix, service: sync }]
  tls:
    - secretName: gotipe-tls
      hosts: [api.gotipe.example.com, sync.gotipe.example.com]
```

---

## Infrastructure — Hetzner VDS

### Почему VDS, а не serverless

| | Hetzner VDS | Serverless stack (Workers + Neon + R2) |
|---|---|---|
| **Цена** | **~EUR 7/мес** | ~$80/мес |
| **DB latency** | **<1ms** (localhost) | 10-50ms (network hop) |
| **Контроль** | Полный | Зависимость от вендоров |
| **Масштабирование** | VDS upgrade (CX32→CX42) | Дорожает линейно с usage |

### VDS спека

| Компонент | Spec |
|-----------|------|
| **Server** | Hetzner CX32: 4 vCPU, 8 GB RAM, 80 GB NVMe |
| **OS** | Ubuntu 24.04 LTS |
| **Orchestration** | Docker Compose |
| **Reverse proxy** | Caddy (auto TLS via Let's Encrypt) |
| **CDN + DDoS** | Cloudflare (DNS proxy, caching) |
| **Object storage** | Cloudflare R2 (zero egress, S3-compatible) |
| **Price** | ~EUR 7/мес |

### Cloudflare R2 — Object Storage

**Почему R2:**

| Фактор | Cloudflare R2 | AWS S3 | MinIO (self-hosted) |
|--------|--------------|--------|---------------------|
| Egress | **$0** | $0.09/GB | $0 (но VDS трафик) |
| Storage | $0.015/GB/мес | $0.023/GB/мес | Disk space на VDS |
| S3 compatible | Да | Native | Да |
| CDN | Встроенный (R2 public URL) | CloudFront (доп.) | Нет |
| Free tier | 10GB storage, 10M reads | 5GB, 12 мес | Unlimited |
| Бэкапы | Отдельный bucket | S3 lifecycle | Ручное |

**Конфигурация:**
- Bucket: `gotipe-data` (CRDT snapshots, exports, attachments)
- Bucket: `gotipe-backups` (pgBackRest WAL + incremental)
- Public access: через custom domain `cdn.gotipe.com`
- R2 credentials: через `.env` файл на сервере

> **Production = Cloudflare R2.** MinIO используется только для локальной разработки (`docker-compose.dev.yml`).

### Server Provisioning (setup-server.sh)

Любой новый сервер поднимается за 2 шага:

```bash
# Шаг 1: Скопировать infra/ на сервер
scp -r infra/ deploy@NEW_SERVER_IP:/opt/gotipe/

# Шаг 2: Запустить setup
ssh deploy@NEW_SERVER_IP "cd /opt/gotipe && bash scripts/setup-server.sh"
```

```bash
#!/bin/bash
# infra/scripts/setup-server.sh — полное провижионирование сервера
set -euo pipefail

REPO="gotipe/gotipe"

# ─── 1. OS + Docker ───
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 fail2ban ufw gh

# ─── 2. Firewall ───
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable

# ─── 3. Deploy user ───
useradd -m -s /bin/bash deploy || true
usermod -aG docker deploy

# ─── 4. SSH ключ + GitHub авторизация ───
sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/id_ed25519 -N ""
gh auth login --with-token <<< "$GITHUB_TOKEN"
gh repo deploy-key add /home/deploy/.ssh/id_ed25519.pub \
   --repo $REPO --title "server-$(hostname)"

# ─── 5. Клонируем репу (для git pull при деплое конфигов) ───
sudo -u deploy git clone git@github.com:$REPO.git /opt/gotipe/repo

# ─── 6. GitHub Secrets (автодеплой будет знать IP и SSH ключ) ───
SERVER_IP=$(curl -s ifconfig.me)
gh secret set DEPLOY_HOST --repo $REPO --body "$SERVER_IP"
gh secret set DEPLOY_KEY --repo $REPO --body "$(cat /home/deploy/.ssh/id_ed25519)"

# ─── 7. .env ───
if [ ! -f /opt/gotipe/.env ]; then
  cp /opt/gotipe/.env.example /opt/gotipe/.env
  echo "⚠️  Отредактируй /opt/gotipe/.env перед запуском"
fi

# ─── 8. Запуск всех сервисов ───
cd /opt/gotipe && docker compose up -d

# ─── 9. Бэкапы ───
cp /opt/gotipe/scripts/backup-cron /etc/cron.d/gotipe-backup

echo "✅ Сервер готов. Автодеплой настроен."
echo "   IP: $SERVER_IP"
echo "   Следующий push to main → автоматический деплой API"
```

**После setup** — всё автоматически. `git push` → GitHub Actions → SSH → `deploy.sh` → zero-downtime update.

### Disaster Recovery (restore.sh)

Восстановление на новый сервер из Cloudflare R2:

```bash
#!/bin/bash
# infra/scripts/restore.sh — восстановление из R2 бэкапа
set -euo pipefail

echo "=== GoTipe Disaster Recovery ==="

# 1. Остановить сервисы (если запущены)
docker compose down 2>/dev/null || true

# 2. Поднять только PostgreSQL
docker compose up -d postgres
sleep 10

# 3. Восстановить из pgBackRest (R2)
docker compose exec postgres pgbackrest --stanza=gotipe restore

# 4. Если нужен PITR — указать время
# docker compose exec postgres pgbackrest --stanza=gotipe \
#   --type=time --target="2026-02-10 14:30:00+00" restore

# 5. Перезапустить PostgreSQL для применения recovery
docker compose restart postgres
sleep 10

# 6. Проверить целостность
docker compose exec postgres psql -U gotipe -c "SELECT COUNT(*) FROM documents;"

# 7. Поднять остальные сервисы
docker compose up -d

echo "=== Recovery complete ==="
echo "   Проверьте: curl https://api.gotipe.com/healthz"
```

**Смена сервера (полная):**
1. Купить новый Hetzner VDS
2. `scp -r infra/ deploy@NEW_IP:/opt/gotipe/` + `bash setup-server.sh` (скрипт обновит GitHub Secrets с новым IP)
3. `bash restore.sh` (восстановит БД из R2)
4. Обновить DNS в Cloudflare → новый IP
5. Готово, автодеплой работает на новый сервер

### Стоимость инфраструктуры (Self-Hosted)

| Компонент | Сервис | EUR/мес |
|-----------|--------|---------|
| VDS (API + Postgres + Valkey) | Hetzner CX32 | 6.80 |
| Object storage (data + backups) | Cloudflare R2 free tier | 0 |
| CDN + DDoS | Cloudflare free | 0 |
| Monitoring | Prometheus + Grafana (self-hosted) | 0 |
| Domain | gotipe.com | ~1.00 |
| **Total** | | **~EUR 8/мес** |

> Для сравнения: Tiptap Cloud начинается от $49/мес за 500 документов. GoTipe self-hosted = **~EUR 8/мес** за unlimited документов.

---

## Deployment Strategy

### Zero-Downtime Deploy с автоматическими миграциями

Каждый деплой включает автоматический запуск миграций **до** старта новой версии API. Rolling update гарантирует отсутствие downtime.

```bash
#!/bin/bash
# infra/scripts/deploy.sh — Zero-downtime deploy
set -euo pipefail

IMAGE_TAG="${1:-latest}"
COMPOSE="docker compose -f /opt/gotipe/docker-compose.yml"

echo "=== GoTipe Cloud Deploy: ${IMAGE_TAG} ==="

# 1. Pull new images
echo "[1/5] Pulling images..."
$COMPOSE pull api sync export-worker

# 2. Run database migrations BEFORE starting new code
echo "[2/5] Running migrations..."
$COMPOSE run --rm api /gotipe-cloud migrate up

# 3. Scale API to 2 instances (new + old run in parallel)
echo "[3/5] Starting new container..."
$COMPOSE up -d --no-deps --scale api=2 api

# 4. Wait for new container health check
echo "[4/5] Waiting for health check..."
sleep 5
for i in $(seq 1 12); do
    if docker compose exec api wget -qO- http://localhost:8080/healthz > /dev/null 2>&1; then
        echo "  Health check passed (attempt $i)"
        break
    fi
    echo "  Waiting... (attempt $i/12)"
    sleep 5
done

# 5. Stop old container, scale back to 1
echo "[5/5] Removing old container..."
OLD_CONTAINER=$(docker ps --filter "name=gotipe-api" --format '{{.ID}}' | tail -1)
docker stop "$OLD_CONTAINER" 2>/dev/null || true
$COMPOSE up -d --no-deps --scale api=1 api

# Update sync + export worker (stateless, можно restart)
$COMPOSE up -d --no-deps sync export-worker

echo "=== Deploy complete ==="
```

**Принцип:** Миграции SQL backward-compatible (additive-only). Новый код работает со старой и новой схемой. Деструктивные изменения (drop column) — отдельный миграционный шаг через 1+ версий.

### Graceful Shutdown (6 фаз)

Go-сервер корректно завершает работу, не теряя in-flight requests:

```go
// apps/cloud/cmd/api/main.go

func main() {
    // ... setup ...

    srv := &http.Server{Addr: addr, Handler: mux}

    // Goroutine для HTTP server
    go func() {
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            logger.Error("server error", "err", err)
        }
    }()

    // Ожидание сигнала завершения
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    logger.Info("shutdown: starting graceful shutdown")

    // Phase 1: Прекращаем приём новых соединений
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    // Phase 2: Drain HTTP in-flight requests (30s timeout)
    if err := srv.Shutdown(ctx); err != nil {
        logger.Error("shutdown: http drain failed", "err", err)
    }
    logger.Info("shutdown: http drained")

    // Phase 3: Stop WebSocket sync rooms (graceful disconnect)
    syncServer.Shutdown(ctx)
    logger.Info("shutdown: sync rooms closed")

    // Phase 4: Stop background workers
    exportWorker.Stop()
    cleanupWorker.Stop()
    logger.Info("shutdown: workers stopped")

    // Phase 5: Close storage connections
    db.Close()
    valkey.Close()
    logger.Info("shutdown: storage closed")

    // Phase 6: Exit
    logger.Info("shutdown: complete")
}
```

| Фаза | Действие | Timeout |
|------|----------|---------|
| 1 | Stop accepting new connections | Мгновенно |
| 2 | Drain HTTP in-flight requests | 30s |
| 3 | Close WebSocket rooms, notify clients | 10s |
| 4 | Stop background workers (finish current tasks) | 15s |
| 5 | Close DB pool + Valkey connections | 5s |
| 6 | Exit 0 | — |

---

## Backup & Disaster Recovery

### Стратегия бэкапов

| Тип | Частота | Хранение | Цель |
|-----|---------|----------|------|
| **WAL archiving** | Непрерывный (каждый сегмент) | R2 (30 дней) | Point-in-time recovery |
| **Incremental backup** | Ежедневно 03:00 UTC | R2 (30 дней) | Fast restore |
| **Full backup** | Еженедельно (воскресенье) | R2 (90 дней) | Baseline |
| **CRDT snapshots** | При compaction (~100 updates) | R2 | Отдельный pipeline |

### pgBackRest (PostgreSQL Backup)

```bash
# /etc/pgbackrest/pgbackrest.conf
[gotipe]
pg1-path=/var/lib/postgresql/data
pg1-port=5432

[global]
repo1-type=s3
repo1-s3-bucket=gotipe-backups
repo1-s3-endpoint=${R2_ACCOUNT_ID}.r2.cloudflarestorage.com
repo1-s3-region=auto
repo1-s3-key=${R2_ACCESS_KEY_ID}
repo1-s3-key-secret=${R2_SECRET_ACCESS_KEY}
repo1-s3-uri-style=path
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=${BACKUP_ENCRYPTION_KEY}
repo1-retention-full=4
repo1-retention-diff=30

[global:archive-push]
compress-type=zst
compress-level=3
```

> **Cloudflare R2** полностью совместим с S3 API — pgBackRest работает через S3 protocol. Zero egress = бэкапы не стоят на трафике.

```bash
# Crontab для бэкапов
# WAL archiving — автоматически через archive_command
# Incremental backup — ежедневно
0 3 * * * pgbackrest --stanza=gotipe --type=incr backup
# Full backup — еженедельно
0 4 * * 0 pgbackrest --stanza=gotipe --type=full backup
```

### Point-in-Time Recovery (PITR)

```bash
# Восстановление до конкретного момента
pgbackrest --stanza=gotipe \
  --type=time \
  --target="2026-02-10 14:30:00+00" \
  restore
```

### Disaster Recovery — время восстановления

| Сценарий | RTO (Recovery Time) | RPO (Data Loss) |
|----------|:-------------------:|:---------------:|
| Container crash | 30s (Docker restart: always) | 0 |
| Server reboot | <1 min (docker-compose auto-start) | 0 |
| Data corruption | 15-30 min (PITR до нужной секунды) | Секунды |
| Disk failure | 30-60 min (новый VDS + R2 restore) | Минуты (WAL lag) |
| Full disaster (весь сервер) | 1-2 часа (новый VDS + полный restore из R2) | Минуты |
| Region failure | 2-4 часа (другой region + R2 global access) | Минуты |

---

## Background Workers

Помимо основных сервисов (API, Sync, Export Worker), GoTipe Cloud использует фоновые задачи для обслуживания данных.

### Cleanup Worker

Периодическая очистка устаревших данных:

```go
// apps/cloud/internal/worker/cleanup.go

type CleanupWorker struct {
    db     *sql.DB
    r2     R2Client
    ticker *time.Ticker
}

func (w *CleanupWorker) Run(ctx context.Context) {
    w.ticker = time.NewTicker(1 * time.Hour)
    defer w.ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-w.ticker.C:
            w.cleanOrphanExports(ctx)
            w.cleanExpiredTokens(ctx)
            w.compactDocumentUpdates(ctx)
            w.aggregateUsage(ctx)
        }
    }
}

func (w *CleanupWorker) cleanOrphanExports(ctx context.Context) {
    // Удаление export jobs старше 7 дней с R2 файлами
    rows, _ := w.db.QueryContext(ctx,
        `DELETE FROM export_jobs
         WHERE completed_at < now() - interval '7 days'
         RETURNING r2_result_key`)
    defer rows.Close()

    for rows.Next() {
        var key string
        rows.Scan(&key)
        if key != "" {
            w.r2.Delete(ctx, key)
        }
    }
}

func (w *CleanupWorker) compactDocumentUpdates(ctx context.Context) {
    // Документы с >200 incremental updates → compact в snapshot
    rows, _ := w.db.QueryContext(ctx,
        `SELECT document_id, COUNT(*) as cnt
         FROM document_updates
         GROUP BY document_id
         HAVING COUNT(*) > 200`)
    defer rows.Close()

    for rows.Next() {
        var docID string
        var cnt int
        rows.Scan(&docID, &cnt)
        w.compactDocument(ctx, docID)
    }
}
```

### Retry Worker (Compensation Pattern)

Для операций, которые зависят от внешних сервисов (Stripe, email, webhooks), применяется compensation pattern с экспоненциальным backoff:

```go
// apps/cloud/internal/worker/retry.go

type RetryWorker struct {
    db     *sql.DB
    ticker *time.Ticker
}

func (w *RetryWorker) Run(ctx context.Context) {
    w.ticker = time.NewTicker(30 * time.Second)
    defer w.ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-w.ticker.C:
            w.retryPendingWebhooks(ctx)
            w.retryPendingNotifications(ctx)
        }
    }
}

func (w *RetryWorker) retryPendingWebhooks(ctx context.Context) {
    rows, _ := w.db.QueryContext(ctx,
        `SELECT id, url, payload, retry_count
         FROM pending_webhooks
         WHERE next_retry_at <= now() AND retry_count < 5`)
    defer rows.Close()

    for rows.Next() {
        var wh Webhook
        rows.Scan(&wh.ID, &wh.URL, &wh.Payload, &wh.RetryCount)

        if err := sendWebhook(ctx, wh); err != nil {
            // Exponential backoff: 10s, 60s, 300s, 1800s, 10800s
            delay := time.Duration(math.Pow(6, float64(wh.RetryCount))) * 10 * time.Second
            w.db.ExecContext(ctx,
                `UPDATE pending_webhooks
                 SET retry_count = retry_count + 1,
                     next_retry_at = now() + $1,
                     last_error = $2
                 WHERE id = $3`,
                delay, err.Error(), wh.ID)
        } else {
            w.db.ExecContext(ctx,
                `DELETE FROM pending_webhooks WHERE id = $1`, wh.ID)
        }
    }
}
```

**Принцип:** Основная транзакция (создание документа, публикация) фиксируется в БД немедленно. Побочные эффекты (webhook, уведомление) ставятся в очередь **вне транзакции**. Если побочный эффект не удался — пользователь не блокирован, retry worker обработает позже.

---

## Operational Patterns

### Idempotency Keys

Все мутирующие API-вызовы (POST, PATCH, DELETE) поддерживают идемпотентность через header `Idempotency-Key`:

```go
// apps/cloud/internal/middleware/idempotency.go

func IdempotencyMiddleware(valkey *redis.Client) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            if r.Method == "GET" || r.Method == "HEAD" {
                next.ServeHTTP(w, r)
                return
            }

            key := r.Header.Get("Idempotency-Key")
            if key == "" {
                next.ServeHTTP(w, r)
                return
            }

            cacheKey := fmt.Sprintf("idempotency:%s:%s", userID, key)

            // Check cached response
            cached, err := valkey.Get(r.Context(), cacheKey).Bytes()
            if err == nil {
                // Return cached response (same status, body, headers)
                var resp CachedResponse
                json.Unmarshal(cached, &resp)
                for k, v := range resp.Headers {
                    w.Header().Set(k, v)
                }
                w.WriteHeader(resp.Status)
                w.Write(resp.Body)
                return
            }

            // Capture response
            rec := httptest.NewRecorder()
            next.ServeHTTP(rec, r)

            // Cache response for 24h
            resp := CachedResponse{
                Status:  rec.Code,
                Headers: rec.Header(),
                Body:    rec.Body.Bytes(),
            }
            data, _ := json.Marshal(resp)
            valkey.Set(r.Context(), cacheKey, data, 24*time.Hour)

            // Write actual response
            for k, v := range rec.Header() {
                w.Header()[k] = v
            }
            w.WriteHeader(rec.Code)
            w.Write(rec.Body.Bytes())
        })
    }
}
```

**Гарантия:** Один и тот же `Idempotency-Key` → одинаковый ответ (предотвращает дублирование документов, двойные exports). Кеш в Valkey — быстрый, TTL 24h, не нагружает PostgreSQL.

### Rate Limiting — Sliding Window (Lua Script)

Атомарный rate limiter через Lua-скрипт в Valkey (ни одного race condition):

```lua
-- infra/scripts/rate-limit.lua
-- Sliding window rate limiter (атомарная операция)

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])  -- ms
local now = tonumber(ARGV[3])     -- ms
local window_start = now - window

-- 1. Удалить устаревшие записи
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- 2. Подсчитать текущее количество в окне
local count = redis.call('ZCARD', key)

if count < limit then
    -- 3. Добавить текущий запрос
    redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
    redis.call('PEXPIRE', key, window)
    return 1  -- allowed
else
    redis.call('PEXPIRE', key, window)
    return 0  -- denied
end
```

```go
// apps/cloud/internal/middleware/ratelimit.go

func (rl *RateLimiter) AllowLua(ctx context.Context, key string, limit int, window time.Duration) bool {
    now := time.Now().UnixMilli()
    result, err := rl.valkey.EvalSha(ctx, rl.scriptSHA, []string{key},
        limit, window.Milliseconds(), now).Int()

    if err != nil {
        // Graceful degradation: если Valkey недоступен — пропускаем запрос
        return true
    }
    return result == 1
}
```

**Преимущество над naive подходом:** Sliding window не допускает burst на границах фиксированных окон. Lua-скрипт атомарен — нет race condition при concurrent requests.

### Structured Logging (slog)

```go
// apps/cloud/internal/logger/setup.go

func SetupLogger(env string) *slog.Logger {
    var handler slog.Handler

    if env == "production" {
        // JSON — parseable для Loki/Elasticsearch/Datadog
        handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
            Level: slog.LevelInfo,
        })
    } else {
        // Text — human-readable для разработки
        handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
            Level: slog.LevelDebug,
        })
    }

    return slog.New(handler)
}
```

**Правила логирования:**
- JSON в production (parse-friendly для observability)
- Structured fields: `request_id`, `user_id`, `latency`, `status`
- **Нет PII в логах** — email, имя, document content не логируются
- Log levels: `DEBUG` (development), `INFO` (production default), `WARN`, `ERROR`
- Request ID propagation через весь pipeline (HTTP → DB → R2 → response)

### Unified Error Codes

Все API ошибки следуют единому формату с машиночитаемыми кодами:

```go
// apps/cloud/internal/apierror/codes.go

type APIError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
    Status  int    `json:"-"`
}

var (
    ErrInvalidJSON     = &APIError{"INVALID_JSON", "Request body is not valid JSON", 400}
    ErrValidation      = &APIError{"VALIDATION_ERROR", "Request validation failed", 400}
    ErrUnauthorized    = &APIError{"UNAUTHORIZED", "Missing or invalid authentication", 401}
    ErrInvalidAPIKey   = &APIError{"INVALID_API_KEY", "API key is invalid or expired", 401}
    ErrForbidden       = &APIError{"FORBIDDEN", "Insufficient permissions", 403}
    ErrNotFound        = &APIError{"NOT_FOUND", "Resource not found", 404}
    ErrConflict        = &APIError{"CONFLICT", "Resource already exists", 409}
    ErrQuotaExceeded   = &APIError{"QUOTA_EXCEEDED", "Plan limit reached", 402}
    ErrRateLimited     = &APIError{"RATE_LIMITED", "Too many requests", 429}
    ErrInternal        = &APIError{"INTERNAL_ERROR", "Internal server error", 500}
)
```

```json
// Пример ответа при превышении лимита
{
  "code": "QUOTA_EXCEEDED",
  "message": "Document limit reached for your plan. Current: 1000, Limit: 1000. Upgrade at https://gotipe.com/pricing"
}
```

### Graceful Degradation

| Сценарий | Поведение |
|----------|----------|
| Valkey недоступен | REST API и Sync работают, rate limiting пропускает все запросы, AI cache отключён |
| R2 недоступен | Uploads заблокированы, существующие CRDT snapshots из PostgreSQL (медленнее) |
| AI provider недоступен | Fallback на secondary provider → если все недоступны, AI endpoints возвращают 503 |
| Export worker упал | Export jobs копятся в очереди, обрабатываются при restart |
| PostgreSQL недоступен | Полный downtime (critical dependency) — health check возвращает 503 |

---

## Monitoring

### Health Checks

```go
// apps/cloud/api/handler/health.go
package handler

import (
    "context"
    "net/http"
    "time"
)

// Healthz — liveness probe (сервис жив?)
func Healthz(db *sql.DB, valkey *redis.Client) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte(`{"status":"ok"}`))
    }
}

// Readyz — readiness probe (сервис готов принимать трафик?)
func Readyz(db *sql.DB, valkey *redis.Client, r2 R2Client) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
        defer cancel()

        checks := map[string]string{}
        allOK := true

        // PostgreSQL
        if err := db.PingContext(ctx); err != nil {
            checks["postgres"] = err.Error()
            allOK = false
        } else {
            checks["postgres"] = "ok"
        }

        // Valkey
        if err := valkey.Ping(ctx).Err(); err != nil {
            checks["valkey"] = err.Error()
            allOK = false
        } else {
            checks["valkey"] = "ok"
        }

        // R2
        if err := r2.HeadBucket(ctx); err != nil {
            checks["r2"] = err.Error()
            allOK = false
        } else {
            checks["r2"] = "ok"
        }

        status := http.StatusOK
        if !allOK {
            status = http.StatusServiceUnavailable
        }

        writeJSON(w, status, map[string]any{
            "status": map[bool]string{true: "ok", false: "degraded"}[allOK],
            "checks": checks,
        })
    }
}
```

### Prometheus Config

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: gotipe-api
    static_configs:
      - targets: ["api:8080"]
    metrics_path: /metrics

  - job_name: gotipe-sync
    static_configs:
      - targets: ["sync:8081"]
    metrics_path: /metrics

  - job_name: postgres
    static_configs:
      - targets: ["postgres-exporter:9187"]

  - job_name: valkey
    static_configs:
      - targets: ["valkey-exporter:9121"]
```

### Ключевые алерты

```yaml
# alerts.yml (Prometheus alerting rules)
groups:
  - name: gotipe
    rules:
      - alert: HighAPILatency
        expr: histogram_quantile(0.95, rate(gotipe_api_latency_seconds_bucket[5m])) > 1
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "API p95 latency > 1s"

      - alert: WebSocketConnectionsHigh
        expr: gotipe_ws_connections > 10000
        for: 2m
        labels: { severity: warning }
        annotations:
          summary: "WebSocket connections > 10K"

      - alert: ExportQueueBacklog
        expr: count(export_jobs WHERE status = 'pending') > 100
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "Export queue backlog > 100 jobs"

      - alert: AIProxyErrors
        expr: rate(gotipe_ai_requests_total{status="error"}[5m]) > 0.1
        for: 3m
        labels: { severity: critical }
        annotations:
          summary: "AI proxy error rate > 10%"
```

---

## Pricing

### 3 продукта GoTipe

| Продукт | Описание | Цена |
|---------|----------|------|
| **GoTipe Core** | Headless: Rust/WASM engine, extensions, CRDT, AI layer, export, adapters, self-hosted server | **$0 (MIT)** |
| **GoTipe Block Editor** | Notion-like UI: `<BlockEditor />`, SlashMenu, BubbleMenu, DnD, темы. Лицензия по ключу (офлайн JWT) | **от $149/app/год** |
| **GoTipe Cloud** | Managed sync + AI proxy + export + analytics. **Block Editor лицензия включена** | **от $29/мес** |

### Block Editor лицензии (без Cloud)

| Лицензия | Цена | Domains | Включает |
|----------|------|---------|----------|
| **Indie** | $149/app/год | 1 production | @gotipe/block-editor + @gotipe/theme + @gotipe/ai-ui |
| **Business** | $499/app/год | до 10 | + приоритетная поддержка |
| **Enterprise** | Custom | Unlimited | + source access, SLA |

### Cloud тарифы (Block Editor включён)

```
┌─────────────┬──────────┬──────────┬───────────┬────────────┐
│             │ Starter  │   Pro    │ Business  │ Enterprise │
├─────────────┼──────────┼──────────┼───────────┼────────────┤
│ Цена        │ $29/mo   │ $99/mo   │ $299/mo   │ Custom     │
├─────────────┼──────────┼──────────┼───────────┼────────────┤
│ Block Editor│ ✓ (incl.)│ ✓ (incl.)│ ✓ (incl.) │ ✓ (incl.)  │
│ Документы   │ 1K       │ 10K      │ 100K      │ Unlimited  │
│ AI requests │ 10K/mo   │ 100K/mo  │ 1M/mo     │ Unlimited  │
│ Exports     │ 1K/mo    │ Unlimited│ Unlimited │ Unlimited  │
│ MAU         │ 1K       │ 10K      │ 100K      │ Unlimited  │
├─────────────┼──────────┼──────────┼───────────┼────────────┤
│ Sync server │ Shared   │ Shared   │ Dedicated │ Dedicated  │
│ Analytics   │ Basic    │ Full     │ Full      │ Custom     │
│ SSO/SAML    │ —        │ —        │ ✓         │ ✓          │
│ SLA         │ —        │ 99.9%    │ 99.95%    │ 99.99%     │
│ Support     │ Community│ Email    │ Priority  │ Dedicated  │
│ On-premise  │ —        │ —        │ —         │ ✓          │
│ Audit log   │ —        │ —        │ ✓         │ ✓          │
└─────────────┴──────────┴──────────┴───────────┴────────────┘
```

### Модель ценообразования

Гибридная: **document-based + MAU**.

- **Document-based** — количество документов с хотя бы одним sync event за billing period. Документ, который создан, но никто не подключался по WebSocket — не считается.
- **MAU (Monthly Active Users)** — уникальные пользователи, подключавшиеся к WebSocket хотя бы раз за месяц.

Биллинг: тарифицируется по максимальному из двух лимитов. Если превышен лимит документов, но MAU в норме — считается как превышение. Overage: $0.01/doc, $0.005/MAU сверх лимита.

### Сравнение с Tiptap Cloud

```
┌──────────────────────┬────────────────────────┬────────────────────────┐
│                      │     Tiptap Cloud       │     GoTipe Cloud       │
├──────────────────────┼────────────────────────┼────────────────────────┤
│ Entry price          │ $49/mo                 │ $29/mo                 │
│ Docs at entry        │ 500                    │ 1,000                  │
│ $/doc (entry)        │ $0.098                 │ $0.029                 │
├──────────────────────┼────────────────────────┼────────────────────────┤
│ Mid tier             │ $149/mo                │ $99/mo                 │
│ Docs at mid          │ 5,000                  │ 10,000                 │
│ $/doc (mid)          │ $0.030                 │ $0.010                 │
├──────────────────────┼────────────────────────┼────────────────────────┤
│ High tier            │ $999/mo                │ $299/mo                │
│ Docs at high         │ 50,000                 │ 100,000                │
│ $/doc (high)         │ $0.020                 │ $0.003                 │
├──────────────────────┼────────────────────────┼────────────────────────┤
│ AI integration       │ Отдельный addon        │ Включено в тариф       │
│ PDF/DOCX export      │ Нет                    │ Включено в тариф       │
│ Analytics            │ Отдельный addon        │ Включено (Pro+)        │
│ Self-hosted option   │ Нет (только Hocuspocus)│ Hetzner VDS + R2 / Helm│
│ SSO/SAML             │ Enterprise only        │ Business ($299)        │
│ Open-source core     │ Partial (некоторые ext  │ Headless 100% MIT,     │
│                      │  стали MIT в 2025)     │ Block Editor commercial│
└──────────────────────┴────────────────────────┴────────────────────────┘
```

Ключевые преимущества GoTipe Cloud:
1. **3x ниже цена за документ** на entry tier ($0.029 vs $0.098)
2. **AI и Export включены** — не нужно платить за отдельные addons
3. **Block Editor лицензия включена** — не нужно покупать отдельно ($149/yr value)
4. **Self-hosted без ограничений** — Docker Compose, single binary, Helm chart
5. **Headless core MIT** — все extensions, CRDT, AI layer open-source

---

## Client SDK Integration

```typescript
// Подключение к GoTipe Cloud из клиента
import { createEditor } from '@gotipe/core';
import { Collaboration } from '@gotipe/collaboration';
import { AIInline } from '@gotipe/ai';

const editor = createEditor({
  extensions: [
    // ... block types, marks, etc.

    Collaboration.configure({
      // GoTipe Cloud sync endpoint
      serverUrl: 'wss://sync.gotipe.com',
      documentId: 'doc_k7x9m2',
      // JWT token (short-lived, получен через backend)
      token: jwtToken,
    }),

    AIInline.configure({
      // GoTipe Cloud AI proxy endpoint
      apiUrl: 'https://api.gotipe.com/v1/ai',
      token: jwtToken,
      provider: 'openai',
      model: 'gpt-4o-mini',
    }),
  ],
});

// Export через Cloud API
async function exportPDF(documentId: string) {
  const res = await fetch('https://api.gotipe.com/v1/exports', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ document_id: documentId, format: 'pdf' }),
  });

  const { id } = await res.json();

  // Poll until ready (или WebSocket notification)
  let status = 'pending';
  while (status === 'pending' || status === 'processing') {
    await new Promise(r => setTimeout(r, 1000));
    const check = await fetch(`https://api.gotipe.com/v1/exports/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      redirect: 'manual',
    });
    if (check.status === 302) {
      // Download ready
      window.open(check.headers.get('Location')!);
      return;
    }
    status = (await check.json()).status;
  }
}
```

---

## Self-Hosted vs Cloud

| Аспект | Self-Hosted | GoTipe Cloud |
|--------|-------------|--------------|
| Sync server | Вы деплоите и управляете | Managed, auto-scaling |
| AI proxy | Ваши API keys, ваш сервер | Managed, общий rate limit |
| Export | Ваш worker, Cloudflare R2 | Managed |
| Стоимость | Инфраструктура (~EUR 7/mo на Hetzner VDS) | $29-$299/mo |
| SLA | Ваша ответственность | 99.9-99.99% |
| Data residency | Полный контроль | US / EU regions |
| Updates | Ручные (docker pull) | Автоматические |
| Support | Community / GitHub Issues | Email / Priority / Dedicated |

---

## Связанные документы

- [02-collaboration.md](02-collaboration.md) — sync protocol, CRDT engine, awareness
- [07-ai.md](07-ai.md) — AI proxy, ghost text, provider interface
- [08-export-import.md](08-export-import.md) — export service, PDF/DOCX generation
- [12-release-plan.md](12-release-plan.md) — план реализации и релиза
