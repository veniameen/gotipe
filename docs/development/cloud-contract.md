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

Browser WebSockets use subprotocols `gotipe.v1` and
`gotipe.auth.<base64url UTF-8 bearer token>`. The authentication subprotocol is
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

## Durable collaboration and read consistency

`documents.r2_key` references an immutable ordinary document baseline. CRDT
checkpoints and deltas live separately, tagged with that baseline generation.
A durable write precedes a collaboration acknowledgement/broadcast. Each new
durable delta atomically advances the REST document revision and modification
time; replayed duplicates do not. Checkpoints leave the revision unchanged. Late writes
from an old generation are ignored after REST replacement or version restore.

GET, version creation and exports project the current baseline plus checkpoint
and deltas through the same native CRDT engine. GET returns materialized `content`
and an opaque `collaboration_state` containing the original `baseline` and
`updates`. Initialize a new collaborative editor with that baseline, then apply
all supplied updates before editing; the materialized preview is not a substitute
for the replica's baseline. The SDK exposes this as `collaborationState`.

`RATE_LIMIT_WS` limits messages per connection in an exact sliding window;
exhaustion closes with code 1008. REST, AI and WebSocket handshakes have separate
per-user rate namespaces. Authentication attempts use the socket peer IP; a
reverse proxy should enforce its own client-IP gate before forwarding requests.

REST request bodies and stored document reads have bounded sizes; the configured
document limit cannot exceed the converter's 64 MiB ceiling.

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
concurrent quota reservations, late old-generation CRDT inserts, materialized
reads, worker claims/retries/cleanup and subscription reconciliation. Browser
acceptance additionally connects two actual WASM editors to the local service,
edits offline, reconnects, and verifies persisted replay and exported Unicode.

Operational release acceptance still requires the final image's readiness and
migration smoke check, deployment-specific secrets/origins, object storage
retention policy and a restore rehearsal. No external deployment or paid-provider
call is implied by the local test results. OAuth settings and monitoring settings
in older planning documents are not proof of implemented HTTP endpoints; confirm
routes in `cmd/api/main.go` before advertising them.
