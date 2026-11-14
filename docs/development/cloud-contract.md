# Cloud runtime contract and verification

The Cloud API is a Go service with PostgreSQL, Valkey and private S3/R2 storage.
The same image runs REST on port 8080 and authenticated collaboration on 8081.
The native `gotipe-convert` binary in that image uses GoTipe's Rust document/CRDT
engine and owned PDF layout/OOXML exporters with bundled Unicode fonts. The PDF
backend uses maintained format/font libraries and has no Typst compiler dependency.
It does not invoke a remote conversion service.

The Cloud export request contains `document_id` and `format`; PDF jobs use the
native renderer's default A4 options. Page size, custom margins, font size and
header/footer options belong to the native Rust and browser export APIs and are
not Cloud request fields. Cloud acceptance verifies document fidelity and job
failure behavior without claiming a Cloud option matrix that the API does not expose.

## Authorization and idempotency

Password grants verify the stored bcrypt hash. JWT validation requires ES256,
issuer/audience, expiration, a token ID, and matching subject/user identity. API
scopes, current account plan, document restrictions and database permissions are
checked before resource access. Revocation fails closed when its store fails.

Browser WebSockets use subprotocols `gotipe.v2` (operations by generation) or
`gotipe.v1` (every update repeats the baseline) and
`gotipe.auth.<base64url UTF-8 bearer token>`. The server selects `gotipe.v2` when it
is offered and then requires the `generation` query parameter. The authentication subprotocol is
removed before upgrade and never selected or logged. Tokens in query parameters
are not accepted. Active sockets enforce JWT expiration, recheck credential
revocation and the current editor role before data reads/writes, and check idle
sessions every fifteen seconds. Unavailable authorization stores close the
connection instead of retaining access. Configure exact trusted HTTP origins in `HTTP_ALLOWED_ORIGINS`
and WebSocket origins in `SYNC_ALLOWED_ORIGINS`; wildcard origins are rejected.

Mutation idempotency keys are scoped to the user and fingerprint the method, URL,
content type, body and credential restrictions. Pending/uncertain results cannot
be repeated with the same key. Cached successful replies recheck current resource
read access. Streaming AI cannot be buffered/replayed with an idempotency key.
A stored reply is at most 256 KiB (`middleware.MaxReplayBody`); a larger one keeps
only its status, and a repeat answers 409 naming it instead of running again.

Client-supplied document and API-key IDs must be hyphenated UUIDs (either case);
anything else answers 400 `VALIDATION_ERROR` before a database query, including a
`/sync` handshake without `document_id`. Access checks use the lower-case form,
and the sync handler receives it, so one document never opens two rooms.

## Durable collaboration and read consistency

`documents.r2_key` references an immutable ordinary document baseline. CRDT
records live separately in `document_updates`, tagged with that baseline
generation and stored without the baseline. A durable write precedes a
collaboration acknowledgement/broadcast. Each new durable record atomically
advances the REST document revision and modification time; replayed duplicates do
not. A transaction a client sends in parts (`continues`) is buffered per connection
up to `SYNC_TRANSACTION_LIMIT` (16 MiB, at most 30 MiB; a process buffers at most
eight such limits at once) and becomes one record with its last part; a disconnect,
a 30-second pause or an error on any part drops the parts unsaved and closes the
connection. A save that would make the stored state larger than a read applies
(60 MiB) is refused with `DOCUMENT_TOO_LARGE`. Log compaction merges the records of a
generation into one, in a transaction that deletes exactly the rows it merged, and
leaves the revision unchanged. It runs beside a room's event loop, at most two at
once per process. The merged row has a new ID, so stored records are a union in no
particular order: readers apply them together. Late
writes from an old generation are ignored after REST replacement or version restore.

GET, version creation and exports project the current baseline plus its stored
records through the same native CRDT engine. GET returns materialized `content`
and an opaque `collaboration_state` containing the original `baseline`, the
`updates` and `generation`, the token of that baseline. Initialize a new
collaborative editor with that baseline, then apply all supplied updates, as one
merged update, before editing; the materialized preview is not a substitute for the replica's baseline.
A `gotipe.v2` connection names the generation at its handshake and is refused with
`BASELINE_REPLACED` when the document has another one. The SDK exposes the state as
`collaborationState`.

`RATE_LIMIT_WS` limits messages per connection in an exact sliding window;
exhaustion closes with code 1008. `@gotipe/collaboration` sends at most 300 update
frames and 600 presence frames in any minute, so the default of 1000 is not reached
by typing; a lower limit needs a matching client. REST, AI and WebSocket handshakes have separate
per-user rate namespaces. Authentication attempts are limited per client address
(IPv6 per /64). The client is the socket peer unless the peer is listed in
`TRUSTED_PROXIES`; then it is the nearest untrusted `X-Forwarded-For` hop (else
`X-Real-IP`), and a malformed chain falls back to the peer. Request and audit
logs record the same address. The compose stack trusts only Caddy's fixed
address; Caddy sends exactly one address (`{client_ip}`, resolved with its own
`trusted_proxies`, where any CDN is configured) and drops `X-Real-IP`
(`middleware/client_address_test.go` checks the Caddyfile, `config/compose_test.go`
the fixed address). The API logs its trusted prefixes at startup and warns at
most once a minute when an untrusted peer sends forwarded headers.
`infra/scripts/deploy.sh` stops when an existing backend network lacks the fixed
subnet, because Docker never changes it in place.

Valkey state (revocations, idempotency records, rate windows) must not be
evicted: `infra/valkey/valkey.conf` uses `noeviction`, so a full instance makes
writes fail and the API answer 503 instead of forgetting a revocation. The API
exports `INFO memory` (`gotipe_valkey_used_memory_bytes`,
`gotipe_valkey_maxmemory_bytes`) and `ValkeyMemoryHigh` fires at 80%.

REST request bodies and stored document reads have bounded sizes; the configured
document limit cannot exceed the converter's 64 MiB ceiling.

## Configuration, readiness and metrics

The server reads its environment only through `config.LoadFrom` (`migrate up`
reads just `DATABASE_URL`). `infra/.env.example` must load through it
(`config/env_example_test.go`): every variable it sets must be read, and every
variable read must be listed. Durations are Go durations only.
Missing `DATABASE_URL`, `JWT_PRIVATE_KEY` or `JWT_PUBLIC_KEY`, an unknown
`LOG_LEVEL`/`LOG_FORMAT` or a `TRUSTED_PROXIES` range covering every address
stops startup.

`/readyz` is public: it checks PostgreSQL, Valkey and the bucket concurrently and
reports each only as `ok` or `unavailable`; error details are logged. Metrics on
`METRICS_LISTEN_ADDR` count REST requests by route pattern and status, AI
provider calls (bounded labels), stored documents (counted at most once a minute,
omitted when the count fails), sync connections/rooms and export jobs. Alert
rules and dashboards may only use served series (`handler/metrics_test.go`).
PostgreSQL WAL archiving is off unless pgBackRest is installed and configured.

## Jobs, quotas and failure behavior

Document/export quota decisions use short PostgreSQL advisory-lock transactions
across API instances. AI reserves a durable pending slot before contacting a
provider; failed calls release it, and abandoned reservations expire after fifteen
minutes (provider requests time out after two). AI completion persists actual
success before emitting its final success event. The AI adapters call OpenAI,
Anthropic and Google through platform HTTP; tests use local fake provider servers.

Export jobs preserve durable monthly usage independently of artifact cleanup.
The bounded worker pool claims jobs with `SKIP LOCKED`, records conversion errors,
and uses attempt-specific output keys. Completed artifacts expire after 24 hours;
cleanup deletes the object before removing its database pointer, retaining failed
deletions for retry. A database outbox also retires replaced document/version
objects and keys removed by cascades. The worker waits one hour for in-flight
reads and rechecks all live pointers before deleting. Expired final worker
leases become explicit failures.

Stripe webhook signatures are verified before durable enqueueing. Retry workers
reconcile current subscription state instead of applying stale event payloads.
A per-subscription transaction serializes provider reads and writes; an account
lock makes entitlement calculation include other reconciled subscriptions.
Configured Stripe prices determine plans. Tests never contact Stripe or incur
charges.

## Reproducible local checks

```sh
GOMAXPROCS=2 go -C apps/cloud test -p 2 ./...
# Disposable PostgreSQL only: the integration helper creates isolated schemas.
GOTIPE_TEST_DATABASE_URL=postgres://... GOMAXPROCS=2 \
  go -C apps/cloud test -race -tags integration -p 2 ./...
pnpm check:exports
pnpm check:pdf-regression
pnpm check:packages
docker build -f apps/cloud/Dockerfile -t gotipe-cloud:local .
```

Integration coverage includes roles/scopes, actual PostgreSQL constraints,
concurrent quota reservations, late old-generation CRDT inserts, log compaction
(a row committed during the merge, concurrent saves, old checkpoints), materialized
reads, worker claims/retries/cleanup and subscription reconciliation. Browser
acceptance additionally connects two actual WASM editors to the local service,
edits offline, reconnects, and verifies persisted replay and exported Unicode.

Operational release acceptance still requires the final image's readiness and
migration smoke check, deployment-specific secrets/origins, object storage
retention policy and a restore rehearsal. No external deployment or paid-provider
call is implied by the local test results. OAuth settings and monitoring settings
in older planning documents are not proof of implemented HTTP endpoints; confirm
routes in `cmd/api/main.go` before advertising them.
