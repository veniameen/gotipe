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

**3. Write `infra/.env`.** Compose reads it for its own variables and passes it to the API.
Start from the example, which uses the API's own names and formats (a test loads it through
the API's configuration loader), and replace every `CHANGE_ME` and `example.com` value:

```sh
cp infra/.env.example infra/.env
```

At least set `POSTGRES_PASSWORD`, `HTTP_ALLOWED_ORIGINS`, `SYNC_ALLOWED_ORIGINS`,
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` and
`GRAFANA_ADMIN_PASSWORD`. Then append the keys as quoted multi-line values:

```sh
printf 'JWT_PRIVATE_KEY="%s"\nJWT_PUBLIC_KEY="%s"\n' "$(cat jwt-private.pem)" "$(cat jwt-public.pem)" >> infra/.env
```

For another S3 service, set `S3_ENDPOINT` (and `S3_USE_PATH_STYLE=true` if it needs path-style
URLs) instead of `R2_ACCOUNT_ID`; the access key variables keep their `R2_` names. The bucket
must exist.

**4. Set your host names.** Replace `api.gotipe.com` and `sync.gotipe.com` in
`infra/Caddyfile` with yours.

Caddy has the fixed address `172.30.240.2` on the compose `backend` network
(`172.30.240.0/24`), and the API sets `TRUSTED_PROXIES=172.30.240.2/32`: it takes the client
address from `X-Forwarded-For` only when Caddy sent the request, so the login limit counts
each client separately. Caddy sends one address there, the client as it resolved it
(`{client_ip}`). If that subnet is taken on your host, change the subnet, Caddy's
`ipv4_address` and `TRUSTED_PROXIES` together.

If a CDN or load balancer sits in front of Caddy, configure it in Caddy only: add its ranges
to `trusted_proxies` and enable `trusted_proxies_strict` in Caddy's global options, as the
comment in `infra/Caddyfile` shows. Caddy then forwards the client that proxy reports.
Leave `TRUSTED_PROXIES` at Caddy's address.

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

At startup the API logs its trusted proxies (`trusted_proxies=172.30.240.2/32`). When a
request from any other address carries `X-Forwarded-For` or `X-Real-IP`, it logs a warning,
at most once a minute: behind a proxy this means `TRUSTED_PROXIES` does not match the proxy,
and every client shares one login limit.

### Upgrading a host set up before the fixed subnet

Docker does not change the subnet of an existing network. On a host whose stack was created
before the `backend` network had a fixed subnet, Caddy would keep a dynamic address,
`TRUSTED_PROXIES` would match nothing, and a later `up` of Caddy would fail.
`infra/scripts/deploy.sh` checks the network and stops with these steps. Recreate the
containers and networks once; volumes and data are kept:

```sh
docker compose -f infra/docker-compose.yml --profile monitoring down
infra/scripts/deploy.sh <tag>
IMAGE_TAG=<tag> docker compose -f infra/docker-compose.yml up -d
```

Add `--profile monitoring` to the last command if you run Prometheus and Grafana.

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

The API reads environment variables only; `infra/.env.example` lists all of them. Durations
are Go durations such as `30s` or `1h` (a bare number such as `3600` is rejected); rate limits
are `<count>/<s|sec|min|h|hour>`. An invalid value stops the API at startup.

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
| `TRUSTED_PROXIES` | — | Reverse proxies whose `X-Forwarded-For` (or `X-Real-IP`) names the client: IP addresses or CIDR ranges, comma-separated. The API reads the header right to left and takes the first address outside this list, so list every proxy that appends to it, or have the last proxy send only the client (as the compose stack's Caddy does). Empty trusts no proxy; a range that covers every address is rejected. |
| `LISTEN_ADDR`, `SYNC_LISTEN_ADDR`, `METRICS_LISTEN_ADDR` | `:8080`, `:8081`, `:9090` | Listen addresses. |
| `PROMETHEUS_ENABLED` | `true` | Serve `/metrics`. |
| `RATE_LIMIT_API`, `RATE_LIMIT_AI`, `RATE_LIMIT_WS` | `100/min`, `60/min`, `1000/min` | Requests per user, AI requests per user, messages per WebSocket. |
| `SYNC_TRANSACTION_LIMIT` | `16777216` | Bytes of one collaboration transaction a client may send in parts, 1 MiB to 30 MiB. One API process buffers at most eight such transactions at once. |
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
| `LOG_LEVEL`, `LOG_FORMAT` | `info`, `json` | `debug`, `info`, `warn` or `error`; `json` or `text`. |

Older drafts named `ENV`, `JWT_PRIVATE_KEY_PATH`, `STRIPE_PRICE_STARTER`, `S3_BUCKET`,
`OAUTH_*`, `AI_CACHE_TTL`, `VALKEY_MAX_CONNS` and `R2_CDN_URL`; the API does not read them.

## Health and metrics

- `GET /healthz` answers `200 {"status":"ok"}` while the process runs.
- `GET /readyz` checks PostgreSQL, Valkey and the bucket at the same time, within 3 seconds.
  It answers `200` with `{"status":"ok","checks":{"postgres":"ok","valkey":"ok","r2":"ok"}}`,
  or `503` with `"status":"degraded"` and `"unavailable"` for each failing dependency. The
  response never contains the error; the API logs it as `readiness check failed` with the
  dependency's name. The image's health check uses this endpoint.
- `GET /metrics` on port `9090` serves Go runtime and process metrics and:

| Metric | Labels | Meaning |
|---|---|---|
| `gotipe_http_requests_total` | `method`, `path`, `status` | REST requests. `path` is the route pattern, such as `/v1/documents/{id}`; requests that match no route have `unmatched`. |
| `gotipe_http_request_duration_seconds` | `method`, `path` | REST request duration histogram. |
| `gotipe_ai_requests_total` | `provider`, `model`, `status` | Calls to an AI provider, `success` or `error`. A failed call's model is `unknown` and an unknown provider is `other`, so request fields cannot create new series. |
| `gotipe_documents_total` | — | Stored documents, counted in PostgreSQL at most once a minute. Missing from a scrape when the count fails. |
| `gotipe_valkey_used_memory_bytes`, `gotipe_valkey_maxmemory_bytes` | — | Valkey's `used_memory` and `maxmemory` (`0` means no limit), read with `INFO memory` at each scrape. Missing when Valkey does not answer. |
| `gotipe_websocket_connections`, `gotipe_websocket_rooms` | — | Open `/sync` connections and rooms. |
| `gotipe_export_jobs_total` | `format`, `status` | Finished export jobs, `completed` or `failed`. |

`infra/prometheus.yml` scrapes `api:9090`. The compose stack runs no exporters; the alert
rules and the Grafana dashboards use only the metrics above. `ValkeyMemoryHigh` fires when
Valkey uses more than 80% of `maxmemory`, and the overview dashboard shows the same ratio. For
PostgreSQL, PgBouncer or disk alerts, add the matching exporter and scrape job.

On `SIGTERM` the API stops accepting requests, finishes open ones for up to 30 seconds, closes
the collaboration rooms and stops the workers. Every acknowledged collaboration update is
already in PostgreSQL, so nothing is saved at shutdown.

## Valkey

Valkey holds token revocations, idempotency records and rate-limit windows, each with its own
expiry. None of it is a cache: evicting a revocation would make a revoked token work again,
and evicting an idempotency record would let a retry repeat a mutation. `infra/valkey/valkey.conf`
therefore sets `maxmemory 1gb` with `maxmemory-policy noeviction`; the policy covers the whole
instance, not one database. Do not point the API at a Valkey or Redis that evicts keys
(`allkeys-*` or `volatile-*` policies).

When the instance is full, Valkey refuses writes and most API requests answer `503` until keys
expire: rate-limit windows after one window, idempotency records after 24 hours. Size
`maxmemory` for a day of idempotency records — a stored reply is at most 256 KiB. The API
exports Valkey's `used_memory` and `maxmemory` on `/metrics`, and the `ValkeyMemoryHigh` alert
fires at 80%.

## Backups

The compose stack does not archive WAL. `infra/postgres/postgresql.conf` sets
`archive_mode = off`: the stock `postgres:17-alpine` image has no pgBackRest, and a failing
`archive_command` makes PostgreSQL keep every WAL segment until the disk is full.

Without archiving, take logical backups and copy them off the server:

```sh
docker compose -f infra/docker-compose.yml exec -T postgres \
  pg_dump -U gotipe -Fc gotipe > "gotipe-$(date +%F).dump"
```

Document bodies, versions and export files live in the bucket, not in PostgreSQL; back up the
bucket separately.

For point-in-time recovery with pgBackRest instead:

1. Run PostgreSQL from an image that adds pgBackRest to PostgreSQL 17, and mount
   `infra/pgbackrest/pgbackrest.conf` at `/etc/pgbackrest/pgbackrest.conf`.
2. Give that container `PGBACKREST_REPO1_S3_ENDPOINT`, `PGBACKREST_REPO1_S3_KEY`,
   `PGBACKREST_REPO1_S3_KEY_SECRET` and `PGBACKREST_REPO1_CIPHER_PASS`. pgBackRest does not
   expand variables inside its configuration file. The `gotipe-backups` bucket must exist.
3. Create the stanza as the `postgres` user:
   `docker compose exec -u postgres postgres pgbackrest --stanza=gotipe stanza-create`.
4. In `infra/postgres/postgresql.conf`, set `archive_mode = on` and
   `archive_command = 'pgbackrest --stanza=gotipe archive-push %p'`, then restart PostgreSQL.
5. Run `pgbackrest --stanza=gotipe check` the same way. Only when it succeeds, take a full
   backup and schedule `infra/scripts/backup-cron`.

With archiving on, watch disk space and `failed_count` in `pg_stat_archiver`: while
`archive_command` fails, WAL accumulates. `infra/scripts/restore.sh` assumes this setup.
The release checks did not run it; rehearse a restore before you rely on it.

## Limitations

> [!NOTE]
> The compose stack is a starting point, not a tested production setup: the release checks ran
> the image against PostgreSQL, Valkey and MinIO directly. Review it before you rely on it.

- Without the pgBackRest setup above there is no point-in-time recovery.
- The monitoring profile publishes Prometheus (`9090`) and Grafana (`3000`) on every host
  interface, and Grafana's admin password falls back to `admin` when
  `GRAFANA_ADMIN_PASSWORD` is unset. Keep both off the public network.
- Collaboration rooms live in the API process. Run one API process per deployment, or route
  every connection to a document to the same process.

## Related

- [Authentication](/docs/cloud/auth)
- [REST API](/docs/cloud/rest-api)
- [Real-time sync](/docs/cloud/realtime)
- [SDK](/docs/cloud/sdk)
- [Server-side conversion](/docs/conversion/server)
