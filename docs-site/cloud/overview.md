---
title: GoTipe Cloud
description: The self-hosted GoTipe backend — documents, real-time collaboration, exports and an AI proxy — and how to run and configure it.
license: MIT
---

GoTipe Cloud is a backend you run yourself. It stores documents, serves real-time
collaboration for the WASM engine, converts documents in background jobs, and proxies AI
requests so provider keys stay on your server. It is a Go service in `apps/cloud` of the
GoTipe repository. GoTipe does not operate a hosted instance.

Use it when you want those pieces without writing your own server. If you already have one,
you can use the editor packages without Cloud: the editor never requires it.

## Components

| Part | What it does |
|---|---|
| REST API, port `8080` | Accounts, API keys, documents, comments, versions, sharing, organizations, export jobs, AI, Stripe billing. See [REST API](/docs/cloud/rest-api). |
| Sync server, port `8081` | The `/sync` WebSocket for collaborative editing. See [Real-time sync](/docs/cloud/realtime). |
| Metrics, port `9090` | Prometheus `/metrics`. |
| Workers | Export jobs, hourly cleanup, Stripe event processing, daily usage totals. |
| `gotipe-convert` | The native converter for exports and for reading collaborative documents. |
| PostgreSQL | Accounts, document metadata, collaboration updates, jobs, usage, audit log. |
| Valkey | Rate limits, idempotency keys, token revocation. |
| S3-compatible storage | Document bodies, version snapshots, export files (Cloudflare R2, MinIO or another S3 API). |

The API, the sync server, metrics and the workers run in one process. The Docker image also
contains `gotipe-convert`, which the API starts for each conversion. PostgreSQL, Valkey and
object storage are separate services.

## Run with Docker Compose

`infra/docker-compose.yml` runs the API behind Caddy (automatic TLS) with PostgreSQL 17,
PgBouncer and Valkey 8; Prometheus and Grafana are in the `monitoring` profile. Object storage
is external. Start in the repository root.

**1. Build the image** under the name the compose file expects:

```sh
docker build -f apps/cloud/Dockerfile -t ghcr.io/gotipe/cloud-api:local .
```

**2. Create a P-256 key pair** for signing access tokens:

```sh
openssl ecparam -name prime256v1 -genkey -noout -out jwt-private.pem
openssl ec -in jwt-private.pem -pubout -out jwt-public.pem
```

**3. Write `infra/.env`.** Compose reads it for its own variables and passes it to the API:

```sh title="infra/.env"
POSTGRES_PASSWORD=change-me
HTTP_ALLOWED_ORIGINS=https://app.example.com
SYNC_ALLOWED_ORIGINS=https://app.example.com
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET=gotipe-data
```

Append the keys as quoted multi-line values:

```sh
printf 'JWT_PRIVATE_KEY="%s"\nJWT_PUBLIC_KEY="%s"\n' "$(cat jwt-private.pem)" "$(cat jwt-public.pem)" >> infra/.env
```

For another S3 service, set `S3_ENDPOINT` (and `S3_USE_PATH_STYLE=true` if it needs path-style
URLs) instead of `R2_ACCOUNT_ID`; the access key variables keep their `R2_` names. The bucket
must exist.

**4. Set your host names.** Replace `api.gotipe.com` and `sync.gotipe.com` in
`infra/Caddyfile` with yours.

**5. Apply the schema.** Migrations connect to PostgreSQL directly, not through PgBouncer:

```sh
cd infra
export IMAGE_TAG=local
docker compose up -d postgres pgbouncer valkey
docker compose run --rm --entrypoint /bin/sh api -c \
  'export DATABASE_URL="postgres://gotipe:${POSTGRES_PASSWORD}@postgres:5432/gotipe?sslmode=disable"; exec /usr/local/bin/gotipe-cloud migrate up'
```

`migrate up` is safe to run on every deploy: applied migrations are skipped, and a changed
migration file stops the run.

**6. Start everything** and check readiness:

```sh
docker compose up -d
docker compose exec api wget -qO- http://localhost:8080/readyz
```

**7. Create the first account** — see [Authentication](/docs/cloud/auth#create-the-first-account).

> [!WARNING]
> Do not copy `infra/.env.example` as it is: several of its names and formats are out of
> date (`JWT_PRIVATE_KEY_PATH`, `STRIPE_PRICE_STARTER`, `JWT_EXPIRY=3600`), and the API
> refuses to start with them. Use the names in the table below.

## Local development

`infra/docker-compose.dev.yml` starts PostgreSQL (`5432`, user and password `gotipe`), Valkey
(`6379`) and MinIO (`9000`, user and password `minioadmin`, bucket `gotipe-data`). Run the API
with Go 1.26, a locally built converter and the key pair from step 2 above:

```sh
docker compose -f infra/docker-compose.dev.yml up -d
pnpm build:converter
export DATABASE_URL="postgres://gotipe:gotipe@localhost:5432/gotipe?sslmode=disable"
export S3_ENDPOINT=http://localhost:9000 S3_USE_PATH_STYLE=true
export R2_ACCESS_KEY_ID=minioadmin R2_SECRET_ACCESS_KEY=minioadmin
export JWT_PRIVATE_KEY="$(cat jwt-private.pem)" JWT_PUBLIC_KEY="$(cat jwt-public.pem)"
export GOTIPE_EXPORT_COMMAND="$PWD/target/release/gotipe-convert"
go -C apps/cloud run ./cmd/api migrate up
go -C apps/cloud run ./cmd/api
```

In `development`, the API allows the origins `http://localhost:3000`, `http://localhost:5173`
and their `127.0.0.1` forms unless `HTTP_ALLOWED_ORIGINS` is set.

## Configuration

The API reads environment variables only. Durations are Go durations such as `30s` or `1h`;
rate limits are `<count>/<s|sec|min|h|hour>`. An invalid value stops the API at startup.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL connection URL. |
| `DATABASE_MAX_CONNS`, `DATABASE_IDLE_CONNS` | `50`, `10` | Pool size and connections kept open. |
| `VALKEY_URL`, `VALKEY_PASSWORD` | `redis://localhost:6379/0`, — | Valkey (or Redis) connection. |
| `R2_ACCOUNT_ID` | — | Cloudflare account; sets the R2 endpoint. |
| `S3_ENDPOINT`, `S3_USE_PATH_STYLE` | —, `false` | Any S3-compatible endpoint; overrides `R2_ACCOUNT_ID`. Export download URLs point at this endpoint, so clients must reach it. |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | — | Object storage credentials, for R2 or S3. |
| `R2_BUCKET` | `gotipe-data` | Bucket for documents, versions and exports. |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | required | PEM text of a matching ECDSA P-256 pair (SEC 1 private key, PKIX public key). |
| `JWT_ISSUER`, `JWT_AUDIENCE` | `gotipe`, `gotipe-cloud` | Checked on every token. |
| `JWT_EXPIRY` | `1h` | Access token lifetime. |
| `ENVIRONMENT` | `development` | `development` or `production`. Sets default CORS origins and the API key prefix. |
| `HTTP_ALLOWED_ORIGINS` | per environment | Exact browser origins for the REST API, comma-separated. Set it in production: the built-in production default is GoTipe's own domains. |
| `SYNC_ALLOWED_ORIGINS` | — | Exact browser origins for `/sync`, comma-separated. Wildcards are rejected. |
| `LISTEN_ADDR`, `SYNC_LISTEN_ADDR`, `METRICS_LISTEN_ADDR` | `:8080`, `:8081`, `:9090` | Listen addresses. |
| `PROMETHEUS_ENABLED` | `true` | Serve `/metrics`. |
| `RATE_LIMIT_API`, `RATE_LIMIT_AI`, `RATE_LIMIT_WS` | `100/min`, `60/min`, `1000/min` | Requests per user, AI requests per user, messages per WebSocket. |
| `EXPORT_WORKERS` | `4` | Parallel export jobs, 1–16. |
| `EXPORT_POLL_INTERVAL` | `1s` | How often idle workers look for jobs. |
| `EXPORT_MAX_DOCUMENT_SIZE` | `10485760` | Largest document body in bytes, at most 64 MiB. Request bodies may be 1 MiB larger. |
| `EXPORT_R2_PREFIX` | `exports/` | Key prefix for export files. |
| `GOTIPE_EXPORT_COMMAND` | `gotipe-convert` | Path of the converter binary. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY` | — | Provider keys for `/v1/ai/complete`. |
| `AI_DEFAULT_PROVIDER`, `AI_DEFAULT_MODEL` | `openai`, `gpt-4o-mini` | Used when a request names none. |
| `AI_MAX_TOKENS` | `4096` | Default and largest `max_tokens`. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | — | Stripe billing; without the webhook secret the webhook answers `503`. |
| `STRIPE_PRICE_STARTER_ID`, `STRIPE_PRICE_PRO_ID`, `STRIPE_PRICE_BUSINESS_ID` | — | Stripe prices of the paid plans. |
| `LOG_LEVEL`, `LOG_FORMAT` | `info`, `json` | `debug`, `info`, `warn` or `error`; `json` or text. |

The API also reads `OAUTH_*`, `AI_CACHE_TTL`, `VALKEY_MAX_CONNS` and `R2_CDN_URL`; this release
does not use them.

## Health and metrics

- `GET /healthz` answers `200 {"status":"ok"}` while the process runs.
- `GET /readyz` checks PostgreSQL, Valkey and the bucket. It answers `200` with
  `{"status":"ok","checks":{"postgres":"ok","valkey":"ok","r2":"ok"}}`, or `503` with
  `"status":"degraded"` and the failing check's error. The image's health check uses it.
- `GET /metrics` on port `9090` serves Go runtime and process metrics and
  `gotipe_websocket_connections`, `gotipe_websocket_rooms` and
  `gotipe_export_jobs_total{format,status}`.

On `SIGTERM` the API stops accepting requests, finishes open ones for up to 30 seconds, saves
collaboration checkpoints and stops the workers.

## Limitations

> [!NOTE]
> The compose stack is a starting point, not a tested production setup: the release checks ran
> the image against PostgreSQL, Valkey and MinIO directly. Review it before you rely on it.

- `infra/prometheus.yml` scrapes `api:8080` and `sync:8081`; point it at `api:9090`.
  `gotipe_http_requests_total`, `gotipe_http_request_duration_seconds`,
  `gotipe_ai_requests_total` and `gotipe_documents_total` are registered but not updated.
- `infra/postgres/postgresql.conf` archives WAL through pgBackRest, which the
  `postgres:17-alpine` image does not contain. Add it to the image, or change the archive
  settings, before you depend on backups.
- Grafana's admin password defaults to `admin`; set `GRAFANA_ADMIN_PASSWORD`.
- Collaboration rooms live in the API process. Run one API process per deployment, or route
  every connection to a document to the same process.

## Related

- [Authentication](/docs/cloud/auth)
- [REST API](/docs/cloud/rest-api)
- [Real-time sync](/docs/cloud/realtime)
- [SDK](/docs/cloud/sdk)
- [Server-side conversion](/docs/conversion/server)
