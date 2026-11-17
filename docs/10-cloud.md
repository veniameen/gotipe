# GoTipe Cloud

> **PDF: historical proposal.** The mentions of Typst/docx-rs and the size and capability
> estimates below do not describe the current backend. GoTipe owns PDF layout and
> OOXML rendering; the current references are the [export contract](development/export-contract.md)
> and the [dependency policy](development/dependencies.md).

> Historical design document. The signatures, sizes, prices, comparisons and plans below
> do not confirm the current implementation or an available service. Current contracts:
> [development](development/cloud-contract.md), [export](development/export-contract.md),
> [Cloud](development/cloud-contract.md), [release readiness](22-release-readiness.md).

## Overview

GoTipe Cloud is a managed backend for the GoTipe editor: collaboration sync, AI proxy, document export, analytics. The open-source core works without the cloud. Cloud is optional infrastructure for those who do not want to deploy their own backend.

Key differences from Tiptap Cloud:
- Price per document is 2-3x lower
- AI proxy and export are included in the plan (Tiptap charges separately or does not offer them)
- Self-hosted option: Hetzner VDS + Docker Compose + Cloudflare R2 (~EUR 8/mo)

---

## Architecture

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

## Services

### 1. Collaboration — WebSocket Sync

The sync server accepts WebSocket connections, merges CRDT updates, broadcasts changes to all document participants, and persists state in PostgreSQL + Cloudflare R2.

Details of the sync protocol, CRDT engine and awareness are in [02-collaboration.md](02-collaboration.md).

Responsibilities of the Cloud layer:
- Authentication at the WebSocket handshake (API key or JWT)
- Room management (creating/deleting rooms, concurrent user limits)
- Scheduled compaction (merge incremental updates into a snapshot every N updates)
- Document history (storing snapshots with versioning)

### 2. AI Proxy

The LLM proxy is a single access point to AI providers. The client sends a request to GoTipe Cloud, and Cloud routes it to the right provider.

Details of AI integration, ghost text and commands are in [07-ai.md](07-ai.md).

```
Client ──► GoTipe AI Proxy ──┬──► OpenAI (gpt-4o, gpt-4o-mini)
                              ├──► Anthropic (claude-sonnet-4, claude-haiku)
                              └──► Google (gemini-2.0-flash)
```

Proxy features:
- **Rate limiting** — per API key, per user, per provider
- **Response caching** — Valkey, TTL by request type (suggestions = 5min, rewrite = 1h)
- **Streaming** — SSE relay from the provider to the client
- **Fallback** — automatic switch to a secondary provider when the primary is unavailable
- **Cost tracking** — token usage accounting per customer

### 3. Export Service

A queue-based service for generating PDF and DOCX. Uses the Rust WASM core (typst for PDF, docx-rs for DOCX).

Details of export formats are in [08-export-import.md](08-export-import.md).

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

| Format | Engine | Time (100 blocks) | Client-side fallback |
|--------|--------|--------------------|----------------------|
| PDF | typst (Rust) | ~500ms | No |
| DOCX | docx-rs (Rust) | ~300ms | No |
| HTML | gotipe-export (WASM) | ~5ms | Yes |
| Markdown | gotipe-export (WASM) | ~3ms | Yes |

### 4. Analytics

Collects usage metrics: active documents, collaboration sessions, AI requests, export jobs.

| Metric | Type | Description |
|---------|-----|----------|
| `gotipe_documents_total` | Counter | Total number of documents |
| `gotipe_documents_active` | Gauge | Documents with active WebSocket connections |
| `gotipe_ws_connections` | Gauge | Current WebSocket connections |
| `gotipe_ws_messages_total` | Counter | Total WebSocket messages (sync + awareness) |
| `gotipe_ai_requests_total` | Counter | AI proxy requests by provider / model |
| `gotipe_ai_tokens_total` | Counter | Token usage (input + output) |
| `gotipe_exports_total` | Counter | Export jobs by format |
| `gotipe_exports_duration_seconds` | Histogram | Export generation time |
| `gotipe_api_requests_total` | Counter | REST API requests by endpoint / status |
| `gotipe_api_latency_seconds` | Histogram | REST API latency |

---

## PostgreSQL Schema

```sql
-- ============================================================
-- GoTipe Cloud — Database Schema
-- ============================================================

-- Users (account owners)
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL DEFAULT '',
    password_hash   TEXT,                             -- NULL for OAuth-only
    oauth_provider  TEXT,                             -- 'github', 'google', NULL
    oauth_id        TEXT,
    plan            TEXT NOT NULL DEFAULT 'starter',  -- starter, pro, business, enterprise
    stripe_customer_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL;

-- API keys for server-to-server authentication
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT '',
    key_hash        TEXT NOT NULL,                    -- SHA-256 hash of the key
    key_prefix      TEXT NOT NULL,                    -- first 8 characters (for display)
    scopes          TEXT[] NOT NULL DEFAULT '{}',     -- 'documents', 'ai', 'export', 'admin'
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- Documents
CREATE TABLE documents (
    id              TEXT PRIMARY KEY,                 -- client-generated ID (nanoid)
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT '',
    version         BIGINT NOT NULL DEFAULT 0,
    r2_snapshot_key TEXT,                             -- key of the latest CRDT snapshot in R2
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    collaborators   JSONB NOT NULL DEFAULT '[]',     -- [{user_id, role, added_at}]
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_documents_updated ON documents(updated_at DESC);

-- Incremental CRDT updates (periodically compacted into a snapshot)
CREATE TABLE document_updates (
    id              BIGSERIAL PRIMARY KEY,
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    data            BYTEA NOT NULL,                  -- binary CRDT update
    peer_id         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_updates_doc ON document_updates(document_id, id);

-- Document version snapshots
CREATE TABLE document_snapshots (
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version         BIGINT NOT NULL,
    r2_key          TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    peer_id         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, version)
);

-- Export job queue
CREATE TABLE export_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    format          TEXT NOT NULL,                    -- 'pdf', 'docx', 'html', 'md'
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    r2_result_key   TEXT,                             -- key of the result in R2
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_export_jobs_status ON export_jobs(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_export_jobs_user ON export_jobs(user_id, created_at DESC);

-- Usage logs (for billing and analytics)
CREATE TABLE usage_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL,                    -- 'ai_request', 'export', 'ws_connect', 'api_call'
    metadata        JSONB NOT NULL DEFAULT '{}',     -- {model, tokens_in, tokens_out, format, ...}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_logs_user_type ON usage_logs(user_id, event_type, created_at DESC);

-- Partition usage_logs by month (for production)
-- CREATE TABLE usage_logs (...) PARTITION BY RANGE (created_at);
```

---

## REST API

Base URL: `https://api.gotipe.com/v1`

All requests require the header `Authorization: Bearer <api_key>` or `Authorization: Bearer <jwt_token>`.

### Documents CRUD

#### `POST /api/v1/documents` — create a document

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

#### `GET /api/v1/documents/:id` — get a document

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

#### `GET /api/v1/documents` — list documents

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

#### `DELETE /api/v1/documents/:id` — delete a document

```bash
curl -X DELETE https://api.gotipe.com/v1/documents/doc_k7x9m2 \
  -H "Authorization: Bearer gt_live_abc123..."
```

Response `204 No Content`.

### Users

#### `GET /api/v1/users/me` — current user

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

#### `POST /api/v1/api-keys` — create an API key

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

> `key` is returned **only once**, at creation. Store it on the client side.

### Export

#### `POST /api/v1/exports` — create an export job

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

#### `GET /api/v1/exports/:id` — status / download

While `status == "pending"` or `"processing"`, it returns JSON with the status.
When `status == "completed"`, it returns a 302 redirect to an R2 presigned URL.

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

| Code | Message | Description |
|------|---------|----------|
| `4001` | `auth_failed` | Invalid token or API key |
| `4002` | `document_not_found` | Document does not exist |
| `4003` | `plan_limit_reached` | Plan document limit exceeded |
| `4004` | `room_full` | Concurrent user limit for the document exceeded |
| `4005` | `rate_limited` | Too many messages |

---

## Authentication

### Three mechanisms

| Mechanism | Where it is used | Format |
|----------|-----------------|--------|
| **API Key** | Server-to-server, REST API, WebSocket | `Authorization: Bearer gt_live_...` |
| **JWT** | Client-side, short-lived | `Authorization: Bearer eyJhbG...` |
| **OAuth 2.0** | Dashboard login | GitHub, Google providers |

### API Key

Format: `gt_live_sk_<32 hex chars>` (production) or `gt_test_sk_<32 hex chars>` (test).

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

### JWT Generation (for client-side)

```bash
# The client requests a JWT through a server-side endpoint
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

## Go API Server — example endpoints

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

### Document Handler (example)

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

The production stack uses Cloudflare R2 for object storage (zero egress, built-in CDN), Caddy as a reverse proxy with auto TLS, and Hetzner VDS as hosting.

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

> **Production uses Cloudflare R2** — object storage does not need a separate container. R2 credentials are passed through `.env` (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY). MinIO is used only for local development.

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

Caddy automatically obtains and renews TLS certificates through Let's Encrypt. The minimal config is 6 lines.

### Docker Compose (Local Development)

For local development, MinIO replaces R2 and ports are exposed directly:

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

### Running

```bash
# Production (Hetzner VDS)
cd /opt/gotipe && docker compose up -d

# With Prometheus + Grafana
docker compose --profile monitoring up -d

# Local Development
docker compose -f docker-compose.dev.yml up -d

# Check
curl http://localhost:8080/healthz
curl http://localhost:8081/healthz
```

### Single Binary

For cases where Docker is not suitable. All services (API + Sync + Export worker) in one binary.

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

`values.yaml` (main parameters):
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
  enabled: true                # false if using an external PostgreSQL
  auth:
    postgresPassword: gotipe
    database: gotipe

valkey:
  enabled: true
  architecture: standalone     # or replication for HA

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

### Why VDS and not serverless

| | Hetzner VDS | Serverless stack (Workers + Neon + R2) |
|---|---|---|
| **Price** | **~EUR 7/mo** | ~$80/mo |
| **DB latency** | **<1ms** (localhost) | 10-50ms (network hop) |
| **Control** | Full | Vendor dependency |
| **Scaling** | VDS upgrade (CX32→CX42) | Gets more expensive linearly with usage |

### VDS spec

| Component | Spec |
|-----------|------|
| **Server** | Hetzner CX32: 4 vCPU, 8 GB RAM, 80 GB NVMe |
| **OS** | Ubuntu 24.04 LTS |
| **Orchestration** | Docker Compose |
| **Reverse proxy** | Caddy (auto TLS via Let's Encrypt) |
| **CDN + DDoS** | Cloudflare (DNS proxy, caching) |
| **Object storage** | Cloudflare R2 (zero egress, S3-compatible) |
| **Price** | ~EUR 7/mo |

### Cloudflare R2 — Object Storage

**Why R2:**

| Factor | Cloudflare R2 | AWS S3 | MinIO (self-hosted) |
|--------|--------------|--------|---------------------|
| Egress | **$0** | $0.09/GB | $0 (but VDS traffic) |
| Storage | $0.015/GB/mo | $0.023/GB/mo | Disk space on the VDS |
| S3 compatible | Yes | Native | Yes |
| CDN | Built-in (R2 public URL) | CloudFront (extra) | No |
| Free tier | 10GB storage, 10M reads | 5GB, 12 mo | Unlimited |
| Backups | Separate bucket | S3 lifecycle | Manual |

**Configuration:**
- Bucket: `gotipe-data` (CRDT snapshots, exports, attachments)
- Bucket: `gotipe-backups` (pgBackRest WAL + incremental)
- Public access: via custom domain `cdn.gotipe.com`
- R2 credentials: via the `.env` file on the server

> **Production = Cloudflare R2.** MinIO is used only for local development (`docker-compose.dev.yml`).

### Server Provisioning (setup-server.sh)

Any new server comes up in 2 steps:

```bash
# Step 1: Copy infra/ to the server
scp -r infra/ deploy@NEW_SERVER_IP:/opt/gotipe/

# Step 2: Run setup
ssh deploy@NEW_SERVER_IP "cd /opt/gotipe && bash scripts/setup-server.sh"
```

```bash
#!/bin/bash
# infra/scripts/setup-server.sh — full server provisioning
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

# ─── 4. SSH key + GitHub authorization ───
sudo -u deploy ssh-keygen -t ed25519 -f /home/deploy/.ssh/id_ed25519 -N ""
gh auth login --with-token <<< "$GITHUB_TOKEN"
gh repo deploy-key add /home/deploy/.ssh/id_ed25519.pub \
   --repo $REPO --title "server-$(hostname)"

# ─── 5. Clone the repo (for git pull when deploying configs) ───
sudo -u deploy git clone git@github.com:$REPO.git /opt/gotipe/repo

# ─── 6. GitHub Secrets (auto-deploy will know the IP and SSH key) ───
SERVER_IP=$(curl -s ifconfig.me)
gh secret set DEPLOY_HOST --repo $REPO --body "$SERVER_IP"
gh secret set DEPLOY_KEY --repo $REPO --body "$(cat /home/deploy/.ssh/id_ed25519)"

# ─── 7. .env ───
if [ ! -f /opt/gotipe/.env ]; then
  cp /opt/gotipe/.env.example /opt/gotipe/.env
  echo "⚠️  Edit /opt/gotipe/.env before starting"
fi

# ─── 8. Start all services ───
cd /opt/gotipe && docker compose up -d

# ─── 9. Backups ───
cp /opt/gotipe/scripts/backup-cron /etc/cron.d/gotipe-backup

echo "✅ Server is ready. Auto-deploy is configured."
echo "   IP: $SERVER_IP"
echo "   The next push to main → automatic API deploy"
```

**After setup**, everything is automatic. `git push` → GitHub Actions → SSH → `deploy.sh` → zero-downtime update.

### Disaster Recovery (restore.sh)

Restoring onto a new server from Cloudflare R2:

```bash
#!/bin/bash
# infra/scripts/restore.sh — restore from an R2 backup
set -euo pipefail

echo "=== GoTipe Disaster Recovery ==="

# 1. Stop services (if running)
docker compose down 2>/dev/null || true

# 2. Bring up PostgreSQL only
docker compose up -d postgres
sleep 10

# 3. Restore from pgBackRest (R2)
docker compose exec postgres pgbackrest --stanza=gotipe restore

# 4. If PITR is needed, specify the time
# docker compose exec postgres pgbackrest --stanza=gotipe \
#   --type=time --target="2026-02-10 14:30:00+00" restore

# 5. Restart PostgreSQL to apply recovery
docker compose restart postgres
sleep 10

# 6. Verify integrity
docker compose exec postgres psql -U gotipe -c "SELECT COUNT(*) FROM documents;"

# 7. Bring up the remaining services
docker compose up -d

echo "=== Recovery complete ==="
echo "   Check: curl https://api.gotipe.com/healthz"
```

**Server replacement (full):**
1. Buy a new Hetzner VDS
2. `scp -r infra/ deploy@NEW_IP:/opt/gotipe/` + `bash setup-server.sh` (the script updates GitHub Secrets with the new IP)
3. `bash restore.sh` (restores the DB from R2)
4. Update DNS in Cloudflare → new IP
5. Done, auto-deploy works on the new server

### Infrastructure cost (Self-Hosted)

| Component | Service | EUR/mo |
|-----------|--------|---------|
| VDS (API + Postgres + Valkey) | Hetzner CX32 | 6.80 |
| Object storage (data + backups) | Cloudflare R2 free tier | 0 |
| CDN + DDoS | Cloudflare free | 0 |
| Monitoring | Prometheus + Grafana (self-hosted) | 0 |
| Domain | gotipe.com | ~1.00 |
| **Total** | | **~EUR 8/mo** |

> For comparison: Tiptap Cloud starts at $49/mo for 500 documents. GoTipe self-hosted = **~EUR 8/mo** for unlimited documents.

---

## Deployment Strategy

### Zero-Downtime Deploy with automatic migrations

Every deploy automatically runs migrations **before** the new API version starts. A rolling update guarantees no downtime.

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

# Update sync + export worker (stateless, safe to restart)
$COMPOSE up -d --no-deps sync export-worker

echo "=== Deploy complete ==="
```

**Principle:** SQL migrations are backward-compatible (additive-only). The new code works with both the old and new schema. Destructive changes (drop column) are a separate migration step after 1+ versions.

### Graceful Shutdown (6 phases)

The Go server shuts down cleanly without losing in-flight requests:

```go
// apps/cloud/cmd/api/main.go

func main() {
    // ... setup ...

    srv := &http.Server{Addr: addr, Handler: mux}

    // Goroutine for the HTTP server
    go func() {
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            logger.Error("server error", "err", err)
        }
    }()

    // Wait for the shutdown signal
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    logger.Info("shutdown: starting graceful shutdown")

    // Phase 1: Stop accepting new connections
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

| Phase | Action | Timeout |
|------|----------|---------|
| 1 | Stop accepting new connections | Immediate |
| 2 | Drain HTTP in-flight requests | 30s |
| 3 | Close WebSocket rooms, notify clients | 10s |
| 4 | Stop background workers (finish current tasks) | 15s |
| 5 | Close DB pool + Valkey connections | 5s |
| 6 | Exit 0 | — |

---

## Backup & Disaster Recovery

### Backup strategy

| Type | Frequency | Retention | Purpose |
|-----|---------|----------|------|
| **WAL archiving** | Continuous (every segment) | R2 (30 days) | Point-in-time recovery |
| **Incremental backup** | Daily 03:00 UTC | R2 (30 days) | Fast restore |
| **Full backup** | Weekly (Sunday) | R2 (90 days) | Baseline |
| **CRDT snapshots** | On compaction (~100 updates) | R2 | Separate pipeline |

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

> **Cloudflare R2** is fully S3 API compatible, so pgBackRest works over the S3 protocol. Zero egress means backups cost nothing in traffic.

```bash
# Crontab for backups
# WAL archiving — automatic via archive_command
# Incremental backup — daily
0 3 * * * pgbackrest --stanza=gotipe --type=incr backup
# Full backup — weekly
0 4 * * 0 pgbackrest --stanza=gotipe --type=full backup
```

### Point-in-Time Recovery (PITR)

```bash
# Restore to a specific point in time
pgbackrest --stanza=gotipe \
  --type=time \
  --target="2026-02-10 14:30:00+00" \
  restore
```

### Disaster Recovery — recovery time

| Scenario | RTO (Recovery Time) | RPO (Data Loss) |
|----------|:-------------------:|:---------------:|
| Container crash | 30s (Docker restart: always) | 0 |
| Server reboot | <1 min (docker-compose auto-start) | 0 |
| Data corruption | 15-30 min (PITR to the exact second) | Seconds |
| Disk failure | 30-60 min (new VDS + R2 restore) | Minutes (WAL lag) |
| Full disaster (entire server) | 1-2 hours (new VDS + full restore from R2) | Minutes |
| Region failure | 2-4 hours (another region + R2 global access) | Minutes |

---

## Background Workers

Besides the main services (API, Sync, Export Worker), GoTipe Cloud uses background tasks for data maintenance.

### Cleanup Worker

Periodic cleanup of stale data:

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
    // Delete export jobs older than 7 days along with their R2 files
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
    // Documents with >200 incremental updates → compact into a snapshot
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

For operations that depend on external services (Stripe, email, webhooks), a compensation pattern with exponential backoff is used:

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

**Principle:** The main transaction (document creation, publishing) is committed to the DB immediately. Side effects (webhook, notification) are queued **outside the transaction**. If a side effect fails, the user is not blocked and the retry worker handles it later.

---

## Operational Patterns

### Idempotency Keys

All mutating API calls (POST, PATCH, DELETE) support idempotency through the `Idempotency-Key` header:

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

**Guarantee:** The same `Idempotency-Key` → the same response (prevents duplicate documents and double exports). The cache lives in Valkey: fast, TTL 24h, no load on PostgreSQL.

### Rate Limiting — Sliding Window (Lua Script)

An atomic rate limiter via a Lua script in Valkey (no race conditions):

```lua
-- infra/scripts/rate-limit.lua
-- Sliding window rate limiter (atomic operation)

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])  -- ms
local now = tonumber(ARGV[3])     -- ms
local window_start = now - window

-- 1. Remove stale entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- 2. Count the current number in the window
local count = redis.call('ZCARD', key)

if count < limit then
    -- 3. Add the current request
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
        // Graceful degradation: if Valkey is unavailable, let the request through
        return true
    }
    return result == 1
}
```

**Advantage over the naive approach:** A sliding window does not allow bursts at fixed-window boundaries. The Lua script is atomic, so there is no race condition with concurrent requests.

### Structured Logging (slog)

```go
// apps/cloud/internal/logger/setup.go

func SetupLogger(env string) *slog.Logger {
    var handler slog.Handler

    if env == "production" {
        // JSON — parseable for Loki/Elasticsearch/Datadog
        handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
            Level: slog.LevelInfo,
        })
    } else {
        // Text — human-readable for development
        handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
            Level: slog.LevelDebug,
        })
    }

    return slog.New(handler)
}
```

**Logging rules:**
- JSON in production (parse-friendly for observability)
- Structured fields: `request_id`, `user_id`, `latency`, `status`
- **No PII in logs** — email, name and document content are not logged
- Log levels: `DEBUG` (development), `INFO` (production default), `WARN`, `ERROR`
- Request ID propagation through the whole pipeline (HTTP → DB → R2 → response)

### Unified Error Codes

All API errors follow a single format with machine-readable codes:

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
// Example response when the limit is exceeded
{
  "code": "QUOTA_EXCEEDED",
  "message": "Document limit reached for your plan. Current: 1000, Limit: 1000. Upgrade at https://gotipe.com/pricing"
}
```

### Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| Valkey unavailable | REST API and Sync work, rate limiting lets all requests through, AI cache disabled |
| R2 unavailable | Uploads blocked, existing CRDT snapshots are served from PostgreSQL (slower) |
| AI provider unavailable | Fallback to the secondary provider → if all are unavailable, AI endpoints return 503 |
| Export worker down | Export jobs pile up in the queue and are processed on restart |
| PostgreSQL unavailable | Full downtime (critical dependency) — health check returns 503 |

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

// Healthz — liveness probe (is the service alive?)
func Healthz(db *sql.DB, valkey *redis.Client) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte(`{"status":"ok"}`))
    }
}

// Readyz — readiness probe (is the service ready to accept traffic?)
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

### Key alerts

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

### The 3 GoTipe products

| Product | Description | Price |
|---------|----------|------|
| **GoTipe Core** | Headless: Rust/WASM engine, extensions, CRDT, AI layer, export, adapters, self-hosted server | **$0 (MIT)** |
| **GoTipe Block Editor** | Notion-like UI: `<BlockEditor />`, SlashMenu, BubbleMenu, DnD, themes. Key-based license (offline JWT) | **from $149/app/year** |
| **GoTipe Cloud** | Managed sync + AI proxy + export + analytics. **Block Editor license included** | **from $29/mo** |

### Block Editor licenses (without Cloud)

| License | Price | Domains | Includes |
|----------|------|---------|----------|
| **Indie** | $149/app/year | 1 production | @gotipe/block-editor + @gotipe/theme + @gotipe/ai-ui |
| **Business** | $499/app/year | up to 10 | + priority support |
| **Enterprise** | Custom | Unlimited | + source access, SLA |

### Cloud plans (Block Editor included)

```
┌─────────────┬──────────┬──────────┬───────────┬────────────┐
│             │ Starter  │   Pro    │ Business  │ Enterprise │
├─────────────┼──────────┼──────────┼───────────┼────────────┤
│ Price       │ $29/mo   │ $99/mo   │ $299/mo   │ Custom     │
├─────────────┼──────────┼──────────┼───────────┼────────────┤
│ Block Editor│ ✓ (incl.)│ ✓ (incl.)│ ✓ (incl.) │ ✓ (incl.)  │
│ Documents   │ 1K       │ 10K      │ 100K      │ Unlimited  │
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

### Pricing model

Hybrid: **document-based + MAU**.

- **Document-based** — the number of documents with at least one sync event per billing period. A document that was created but never connected to over WebSocket does not count.
- **MAU (Monthly Active Users)** — unique users who connected over WebSocket at least once in a month.

Billing: charged by the higher of the two limits. If the document limit is exceeded but MAU is within limits, it still counts as an overage. Overage: $0.01/doc, $0.005/MAU over the limit.

### Comparison with Tiptap Cloud

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
│ AI integration       │ Separate addon         │ Included in plan       │
│ PDF/DOCX export      │ No                     │ Included in plan       │
│ Analytics            │ Separate addon         │ Included (Pro+)        │
│ Self-hosted option   │ No (Hocuspocus only)   │ Hetzner VDS + R2 / Helm│
│ SSO/SAML             │ Enterprise only        │ Business ($299)        │
│ Open-source core     │ Partial (some ext       │ Headless 100% MIT,     │
│                      │  became MIT in 2025)   │ Block Editor commercial│
└──────────────────────┴────────────────────────┴────────────────────────┘
```

Key advantages of GoTipe Cloud:
1. **3x lower price per document** at the entry tier ($0.029 vs $0.098)
2. **AI and Export included** — no need to pay for separate addons
3. **Block Editor license included** — no need to buy it separately ($149/yr value)
4. **Self-hosted without limits** — Docker Compose, single binary, Helm chart
5. **Headless core MIT** — all extensions, CRDT, AI layer are open-source

---

## Client SDK Integration

```typescript
// Connecting to GoTipe Cloud from the client
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
      // JWT token (short-lived, obtained through the backend)
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

// Export via Cloud API
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

  // Poll until ready (or WebSocket notification)
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

| Aspect | Self-Hosted | GoTipe Cloud |
|--------|-------------|--------------|
| Sync server | You deploy and manage it | Managed, auto-scaling |
| AI proxy | Your API keys, your server | Managed, shared rate limit |
| Export | Your worker, Cloudflare R2 | Managed |
| Cost | Infrastructure (~EUR 7/mo on a Hetzner VDS) | $29-$299/mo |
| SLA | Your responsibility | 99.9-99.99% |
| Data residency | Full control | US / EU regions |
| Updates | Manual (docker pull) | Automatic |
| Support | Community / GitHub Issues | Email / Priority / Dedicated |

---

## Related documents

- [02-collaboration.md](02-collaboration.md) — sync protocol, CRDT engine, awareness
- [07-ai.md](07-ai.md) — AI proxy, ghost text, provider interface
- [08-export-import.md](08-export-import.md) — export service, PDF/DOCX generation
- [12-release-plan.md](12-release-plan.md) — release and implementation plan
