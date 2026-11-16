---
title: REST API
description: Every GoTipe Cloud endpoint with its request and response shapes, plus errors, rate limits, idempotency keys and quotas.
license: MIT
---

The REST API listens on port `8080` of your [Cloud deployment](/docs/cloud/overview). The
examples use `https://api.example.com`. Requests and responses are JSON; IDs are UUIDs;
times are RFC 3339 strings. Authenticate with `Authorization: Bearer <token or API key>` —
see [Authentication](/docs/cloud/auth). The [SDK](/docs/cloud/sdk) wraps the most common
calls.

## Conventions

- Send bodies as JSON with `Content-Type: application/json`. Lists come back as `{ "data": [...] }`;
  long lists come in pages — see [Pages](#pages).
- Every response carries `X-Request-ID`. Send your own to correlate logs; otherwise the server
  creates one.
- Browsers may call the API from the origins in `HTTP_ALLOWED_ORIGINS` (with credentials). The
  allowed request headers are `Accept`, `Authorization`, `Content-Type`, `Idempotency-Key` and
  `X-Request-ID`; `X-Request-ID` and `Retry-After` are readable.
- A request body may be up to `EXPORT_MAX_DOCUMENT_SIZE` plus 1 MiB (11 MiB by default).
- A document you cannot access answers `404`, the same as one that does not exist. Actions
  your role does not allow on a document you can see answer `403` or `404`, as noted below.

## Pages

Documents are listed with `limit` and `offset` (see [List](#list)). Comments and versions come
one page at a time after a cursor:

```json
{ "data": [...], "has_more": true, "next_cursor": "MjAyNi0xMS0xNVQxMDowNTowMC4xMjM0NTZaIGM0MWU…" }
```

`limit` is 1–100; any other value means 50. When `has_more` is `true`, pass `next_cursor` as
`cursor` to read the next page; the last page has `has_more: false` and no `next_cursor`. The
cursor is opaque: it names the last item of the page, and the next page starts strictly after
it in the list's order (creation time, then ID). Items created, resolved or deleted between the
requests therefore neither repeat nor shift the rest of the list. A comment created while you
read the pages comes on a later page, because the server stamps it with a later time; with
several API processes, that holds while their clocks agree. A cursor that is not one the
server issued answers `400 VALIDATION_ERROR`.

## Errors

Errors use one envelope, and the error has only `code` and `message`:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "title is required" } }
```

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_JSON` | The body is not valid JSON (an empty body included). |
| 400 | `VALIDATION_ERROR` | A field is missing or invalid, or an ID in the path, query or body is not a UUID; the message names it. |
| 401 | `UNAUTHORIZED` | No bearer credential, or wrong email or password. |
| 401 | `INVALID_TOKEN` | The JWT is invalid, expired or revoked. |
| 401 | `INVALID_API_KEY` | The API key is unknown or expired. |
| 402 | `QUOTA_EXCEEDED` | The plan's limit is reached. |
| 403 | `FORBIDDEN` | A scope is missing, or the action needs another role. |
| 404 | `NOT_FOUND` | The resource does not exist or is not accessible; also unknown routes. |
| 409 | `CONFLICT` | Duplicate ID or slug, a concurrent change, or an idempotency conflict. |
| 413 | `PAYLOAD_TOO_LARGE` | The body or the document is above the configured limit. |
| 429 | `RATE_LIMITED` | Too many requests; wait `Retry-After` seconds. |
| 500 | `INTERNAL_ERROR` | An unexpected failure. |
| 503 | `SERVICE_UNAVAILABLE` | Valkey, the database, object storage or an AI provider is unavailable, or a feature is not configured. |

## Rate limits

Limits use a sliding window in Valkey. A `429` response carries `Retry-After` with the window
length in seconds.

| Limit | Default | Counted per |
|---|---|---|
| Authenticated REST requests (`RATE_LIMIT_API`) | 100 per minute | User |
| `POST /v1/ai/complete`, in addition (`RATE_LIMIT_AI`) | 60 per minute | User |
| `POST /v1/auth/token` | 10 per minute | Client address: the socket peer, or the `X-Forwarded-For` client when the peer is in `TRUSTED_PROXIES`. IPv6 clients count per `/64`. |
| `/sync` connection attempts | `RATE_LIMIT_API` | User |
| Messages on one `/sync` connection (`RATE_LIMIT_WS`) | 1,000 per minute | Connection |

## Idempotency keys

Send `Idempotency-Key` with a `POST`, `PUT`, `PATCH` or `DELETE` to make a retry safe:

```sh
curl -X POST https://api.example.com/v1/documents \
  -H "Authorization: Bearer $GOTIPE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 4b1f7c0e-create-launch-plan" \
  -d '{"title": "Launch plan"}'
```

- A key is at most 255 bytes and is kept per user for 24 hours.
- Repeating the same request with the same key returns the first response — status, headers
  and body, errors included — after checking that you can still read the document or
  organization it concerns.
- The same key with a different method, URL, content type, body or credential scopes answers
  `409 CONFLICT`.
- While the first request is running, or when its result is unknown, the key answers
  `409 CONFLICT`. Check the resource's state instead of retrying with a new key.
- A body sent with a key may be up to 10 MiB. A streaming AI request (`"stream": true`)
  rejects keys with `400`.
- A stored response body is at most 256 KiB. When the first response was larger, the first
  caller still gets all of it, but a repeat answers `409 CONFLICT` with the original status in
  the message; read the resource instead of repeating the mutation.
- The [SDK](/docs/cloud/sdk#safe-retries) sends the header when you pass `idempotencyKey` to a
  call that changes data.

## Quotas

| Plan | Documents owned | AI requests per month | Export jobs per month |
|---|---:|---:|---:|
| `free` | 100 | 100 | 10 |
| `starter` | 1,000 | 10,000 | 1,000 |
| `pro` | 10,000 | 100,000 | unlimited |
| `business` | 100,000 | 1,000,000 | unlimited |
| `enterprise` | 1,000,000 | unlimited | unlimited |

Months are calendar months of the database clock. An AI request counts when it succeeds;
an export counts when it is requested. An unknown plan name counts as `free`. Going over a
limit answers `402 QUOTA_EXCEEDED`. [`GET /v1/billing/usage`](#billing) shows the counters.

## Endpoints

| Method | Path | Scope | Role or rule |
|---|---|---|---|
| `GET` | `/healthz`, `/readyz` | — | Public |
| `POST` | `/v1/auth/token` | — | Public |
| `POST` | `/v1/auth/revoke` | — | The token being revoked |
| `GET` | `/v1/users/me` | — | — |
| `POST`, `GET` | `/v1/api-keys` | `account:manage` | Own keys |
| `DELETE` | `/v1/api-keys/{id}` | `account:manage` | Own keys |
| `POST`, `GET` | `/v1/documents` | `documents:write`, `documents:read` | — |
| `GET` | `/v1/documents/{id}` | `documents:read` | viewer |
| `PATCH` | `/v1/documents/{id}` | `documents:write` | editor |
| `DELETE` | `/v1/documents/{id}` | `documents:write` | owner |
| `POST` | `/v1/documents/{docId}/comments` | `documents:write` | commenter |
| `GET` | `/v1/documents/{docId}/comments` | `documents:read` | viewer |
| `POST` | `/v1/documents/{docId}/comments/{commentId}/replies` | `documents:write` | commenter |
| `POST` | `/v1/documents/{docId}/comments/{commentId}/resolve` | `documents:write` | commenter |
| `DELETE` | `/v1/documents/{docId}/comments/{commentId}` | `documents:write` | Author or owner |
| `POST` | `/v1/documents/{docId}/versions` | `documents:write` | editor |
| `GET` | `/v1/documents/{docId}/versions` | `documents:read` | viewer |
| `POST` | `/v1/documents/{docId}/versions/{versionId}/restore` | `documents:write` | editor |
| `GET`, `PUT` | `/v1/documents/{docId}/permissions` | `documents:read`, `documents:write` | admin |
| `DELETE` | `/v1/documents/{docId}/permissions/{userId}` | `documents:write` | owner |
| `POST` | `/v1/organizations` | `account:manage` | — |
| `GET` | `/v1/organizations/{id}`, `/v1/organizations/{id}/members` | `account:manage` | Member |
| `POST` | `/v1/organizations/{id}/members` | `account:manage` | Organization admin |
| `DELETE` | `/v1/organizations/{id}/members/{userId}` | `account:manage` | Organization admin |
| `POST` | `/v1/exports` | `export:use` | viewer of the document |
| `GET` | `/v1/exports/{id}` | `export:use` | Own jobs |
| `POST` | `/v1/ai/complete` | `ai:use` | viewer of `document_id`, when given |
| `POST` | `/v1/billing/subscribe`, `/v1/billing/cancel` | `account:manage` | — |
| `GET` | `/v1/billing/usage` | `account:manage` | — |
| `POST` | `/v1/webhooks/stripe` | — | Stripe signature |

Real-time editing uses the [`/sync` WebSocket](/docs/cloud/realtime) on port `8081`.

## Health

`GET /healthz` answers `200 {"status":"ok"}`. `GET /readyz` checks PostgreSQL, Valkey and the
bucket and answers `200` or `503`:

```json
{ "status": "ok", "checks": { "postgres": "ok", "valkey": "ok", "r2": "ok" } }
```

With a failing dependency the status is `"degraded"` and that check is `"unavailable"`. The
error itself is only in the server log.

## Authentication

`POST /v1/auth/token` — exchange a password or an API key for an access token.

| Field | Type | Description |
|---|---|---|
| `grant_type` | `"password" \| "api_key"` | Required. |
| `email`, `password` | `string` | Required for `password`. |
| `api_key` | `string` | Required for `api_key`. |

```json
{ "access_token": "eyJhbGciOiJFUzI1NiIs…", "token_type": "Bearer", "expires_at": "2026-11-12T13:00:00Z" }
```

`POST /v1/auth/revoke` — revoke the access token used for the call. Send `{}` or
`{"token_id": "<the token's jti>"}`; any other token ID answers `403`. Returns
`{"status": "revoked"}`.

## Users

`GET /v1/users/me` — the caller's account.

```json
{ "id": "0d4f…", "email": "ada@example.com", "name": "Ada Lovelace", "plan": "free", "created_at": "2026-11-01T08:00:00Z" }
```

`avatar_url` is present when the account has one.

## API keys

`POST /v1/api-keys` — `{ "name": "…", "scopes": ["documents:read"], "expires_at": "2027-01-01T00:00:00Z" }`.
`name` and `scopes` are required (`400` without them); each scope must be one of the five
grantable scopes and held by the caller (`403` otherwise). `"scopes": []` makes a key that can
only call the routes without a scope, such as `GET /v1/users/me`. Returns `201` with the key,
shown only in this response:

```json
{ "id": "0b7c…", "name": "CI", "prefix": "gt_live_", "key": "gt_live_sk_3f9a…", "scopes": ["documents:read"], "created_at": "2026-11-12T12:00:00Z" }
```

`GET /v1/api-keys` — `{ "data": [ … ] }` with `id`, `name`, `prefix`, `scopes`, `last_used_at`,
`expires_at` and `created_at`; never the key. With no keys, `data` is `[]`.

`DELETE /v1/api-keys/{id}` — `204`, `404` for someone else's key, `400` when `id` is not a UUID.

## Documents

A document resource:

```json
{
  "id": "6f1c2b8e-0d1a-4f5e-9a63-2a7d1e0b9c44",
  "title": "Launch plan",
  "version": 7,
  "size_bytes": 120,
  "content": { "version": 1, "blocks": [{ "id": "p1", "type": "paragraph", "attrs": {}, "content": [{ "text": "Hello", "marks": [] }], "children": [] }] },
  "collaboration_state": {
    "baseline": { "version": 1, "blocks": [{ "id": "p1", "type": "paragraph", "attrs": {}, "content": [{ "text": "Hello", "marks": [] }], "children": [] }] },
    "updates": [],
    "generation": "6c0d6e3f5a1b4c2d8e9f0a1b2c3d4e5f"
  },
  "created_at": "2026-11-12T09:30:00Z",
  "updated_at": "2026-11-12T10:02:11Z"
}
```

`version` grows with every change: a `PATCH`, a restore, or a saved collaboration update.
`content` is the current document, with collaboration updates applied. `collaboration_state`
is what a real-time editor starts from — see [Real-time sync](/docs/cloud/realtime#start-from-rest).
Its `generation` is an opaque token that names `baseline`; it changes whenever the content is
replaced, and a real-time editor passes it to `/sync`.

### Create

`POST /v1/documents` → `201` with `content`.

| Field | Type | Description |
|---|---|---|
| `title` | `string` | Required, not empty. |
| `content` | `object` | GoTipe document JSON. Default `{"blocks": []}`. Stored as sent, not validated against a schema. |
| `id` | `string` | Optional UUID chosen by you; `409` when it exists. |

Fails with `402` when the plan's document limit is reached and `413` when `content` is larger
than `EXPORT_MAX_DOCUMENT_SIZE`.

### List

`GET /v1/documents?limit=20&offset=0` — documents you own or that are shared with you, the
most recently updated first, without `content`. `limit` is 1–100 (otherwise 20).

```json
{ "data": [{ "id": "6f1c…", "title": "Launch plan", "version": 7, "size_bytes": 120, "created_at": "…", "updated_at": "…" }], "total": 1, "limit": 20, "offset": 0 }
```

### Read

`GET /v1/documents/{id}` — the document with `content` and `collaboration_state`.

### Update

`PATCH /v1/documents/{id}` with `title`, `content` or both → `200` with the document, without
`content`. New `content` replaces the stored document and discards its collaboration updates.
Connected real-time editors receive `BASELINE_REPLACED` and must load the document again (see
[Replaced content](/docs/cloud/realtime#replaced-content)).

### Delete

`DELETE /v1/documents/{id}` → `204`. Owner only: other users get `404`. Comments, versions,
permissions and export jobs go with it; stored objects are removed by the cleanup worker.

## Comments

A comment:

```json
{
  "id": "c41e…",
  "document_id": "6f1c…",
  "author_id": "0d4f…",
  "author_name": "Ada Lovelace",
  "content": "Is this figure final?",
  "anchor_type": "inline",
  "block_id": "p1",
  "from": 0,
  "to": 5,
  "metadata": { "label": "question" },
  "created_at": "2026-11-12T10:05:00Z",
  "updated_at": "2026-11-12T10:05:00Z"
}
```

Replies have `parent_id`; resolved comments have `resolved_at` and `resolved_by`.
`author_name` is filled in lists.

`POST /v1/documents/{docId}/comments` → `201`.

| Field | Type | Description |
|---|---|---|
| `content` | `string` | Required. |
| `anchor_type` | `"document" \| "block" \| "inline"` | Default `"block"` when `block_id` is set, else `"document"`. |
| `block_id` | `string` | Required for `block` and `inline`. |
| `from`, `to` | `number` | Required for `inline`: text offsets with `0 ≤ from ≤ to`. |
| `metadata` | any JSON | Stored and returned as is. |

`GET /v1/documents/{docId}/comments?include_resolved=true&limit=50&cursor=…` — a
[page](#pages) of comments, oldest first, replies included as separate items. Unresolved only
unless `include_resolved=true`. A comment resolved while you read the pages leaves the
remaining pages as they were.

`POST …/comments/{commentId}/replies` — `{ "content": "…" }` → `201` with the reply, which takes
its parent's `anchor_type` and `block_id` and has `parent_id`. The server keeps only `content`
for a reply: no `metadata`, `from` or `to`.

`POST …/comments/{commentId}/resolve` → `{"status": "resolved"}`; `404` when it is already
resolved.

`DELETE …/comments/{commentId}` → `204`, for the author or the document owner. Replies are
deleted with their comment.

## Versions

A version:

```json
{ "id": "9a2d…", "document_id": "6f1c…", "name": "Sent to legal", "description": "Draft 3", "version_type": "named", "created_by": "0d4f…", "size_bytes": 120, "created_at": "2026-11-12T11:00:00Z" }
```

`POST /v1/documents/{docId}/versions` — `{ "name": "…", "description": "…", "version_type": "named" }`
→ `201`. `name` is required; `version_type` is `named` (default) or `milestone`. The version
is a snapshot of the current content, collaboration updates included.

`GET /v1/documents/{docId}/versions?limit=50&cursor=…` — a [page](#pages) of versions,
newest first. A version created while you read the pages appears on the first page of a new
listing, not again on the next page. Restore points have `version_type` `restore_point` and no
`description`.

`POST /v1/documents/{docId}/versions/{versionId}/restore` → `{"status": "restored", "version_id": "…"}`.
The current content is first saved as a `restore_point` version named
`Before restoring: <versionId>`, whose ID is returned. Collaboration updates are discarded,
and connected real-time editors receive `BASELINE_REPLACED`. A change during the restore
answers `409`.

## Permissions

`GET /v1/documents/{docId}/permissions` — admins and the owner.

```json
{ "data": [{ "user_id": "5e0d…", "user_name": "Grace Hopper", "user_email": "grace@example.com", "role": "editor", "granted_at": "…", "granted_by": "0d4f…" }] }
```

The owner is not in the list. `PUT` with `{ "email": "…", "role": "viewer" | "commenter" | "editor" | "admin" }`
grants or changes a role → `{"status": "granted", "user_id": "…", "role": "…"}`; `404` when no
account has the email. `DELETE …/permissions/{userId}` → `204`, owner only.

## Organizations

`POST /v1/organizations` — `{ "name": "Acme Docs", "slug": "acme-docs" }` → `201`; `409` when the
slug exists.

```json
{ "id": "a1b2…", "name": "Acme Docs", "slug": "acme-docs", "owner_id": "0d4f…", "plan": "free", "created_at": "2026-11-12T12:00:00Z" }
```

`GET /v1/organizations/{id}` — the organization, for members. `GET …/members` —
`{ "data": [{ "user_id": "…", "name": "…", "email": "…", "role": "admin", "joined_at": "…" }] }`.

`POST …/members` — `{ "email": "…", "role": "viewer" | "commenter" | "editor" | "admin" }` →
`201 {"status": "added", "user_id": "…", "role": "…"}`. Adding an existing member changes their
role. Organization admins only; demoting the owner answers `403`.

`DELETE …/members/{userId}` → `204`. Organization admins only; the owner cannot be removed.

## Exports

`POST /v1/exports` — `{ "document_id": "…", "format": "pdf" }` → `202` with a job. Formats:
`html`, `markdown`, `plaintext`, `json`, `pdf`, `docx`.

```json
{ "id": "e7c9…", "document_id": "6f1c…", "format": "pdf", "status": "pending", "created_at": "2026-11-12T12:10:00Z" }
```

`GET /v1/exports/{id}` — your own job. `status` is `pending`, `processing`, `completed` or
`failed`; a completed job has `url` (a signed download URL valid for one hour) and
`completed_at`, a failed one `error`. Jobs disappear 24 hours after completion (7 days after
failure). See [Server-side conversion](/docs/conversion/server#cloud-export-jobs).

## AI

`POST /v1/ai/complete` — run a text command through the configured provider. The body may be
up to 1 MiB.

| Field | Type | Description |
|---|---|---|
| `command` | `string` | Required: `complete`, `rewrite`, `summarize`, `translate`, `fix_grammar` or `change_tone`. |
| `prompt` | `string` | Your instruction. `prompt` or `context` is required. |
| `context` | any JSON | Document context, sent to the model as JSON text. |
| `document_id` | `string` | Optional; you must be at least a viewer of it. |
| `provider` | `"openai" \| "anthropic" \| "google"` | Default `AI_DEFAULT_PROVIDER`. |
| `model` | `string` | Default `AI_DEFAULT_MODEL`; required when `provider` is not the default. |
| `max_tokens` | `number` | 1 to `AI_MAX_TOKENS` (the default). |
| `temperature` | `number` | 0 to 2. |
| `stream` | `boolean` | Stream the answer as server-sent events. |

Without `stream`:

```json
{ "content": "A shorter version of the text.", "model": "gpt-4o-mini", "provider": "openai", "usage": { "prompt_tokens": 412, "completion_tokens": 37 } }
```

With `"stream": true` the response is `text/event-stream`:

```text
event: start
data: {"model":"gpt-4o-mini","provider":"openai"}

event: content
data: {"text":"A shorter "}

event: done
data: {"usage":{"prompt_tokens":412,"completion_tokens":37}}
```

A failure after the stream started arrives as `event: error` with `{"code": "AI_PROVIDER_ERROR", "message": "…"}`
(or `USAGE_RECORD_FAILED` when the usage could not be saved). Before it starts, a missing
provider key or a provider failure answers `503`. Provider calls time out after 2 minutes.

## Billing

These endpoints need Stripe settings on the server.

`POST /v1/billing/subscribe` — `{ "plan": "starter" | "pro" | "business", "success_url": "…", "cancel_url": "…" }`
→ `{"checkout_url": "https://checkout.stripe.com/…", "plan": "pro", "status": "pending"}`. Return
URLs must be HTTPS, or HTTP on `localhost`, `127.0.0.1` or `::1`. A plan without a configured
price answers `503`. The plan changes when Stripe reports the subscription.

`POST /v1/billing/cancel` → `{"status": "canceling"}`: the active subscription ends at the end
of its period. `404` when there is none.

`GET /v1/billing/usage`:

```json
{ "plan": "free", "usage": { "documents": { "current": 12, "limit": 100 }, "ai_requests": { "current": 3, "limit": 100 }, "exports": { "current": 1, "limit": 10 } } }
```

A limit of `-1` means unlimited.

`POST /v1/webhooks/stripe` receives Stripe events. It checks the `Stripe-Signature` header
against `STRIPE_WEBHOOK_SECRET`, stores the event and answers `200`; a worker applies it with
retries. Subscription, checkout and invoice events update the account's plan.

> [!NOTE]
> Not in this release: sign-up, OAuth or SSO, outgoing webhooks, an endpoint for a version's
> content or a diff between versions, comment editing and document import.
> `apps/cloud/api/openapi.yaml` in the repository is out of date; this page follows the server
> code.

## Related

- [Authentication](/docs/cloud/auth)
- [Real-time sync](/docs/cloud/realtime)
- [SDK](/docs/cloud/sdk)
- [GoTipe Cloud](/docs/cloud/overview)
