---
title: Authentication and access
description: Access tokens, API keys, scopes, document roles, sharing and organizations in GoTipe Cloud.
license: MIT
---

Every Cloud route except the health checks, `POST /v1/auth/token` and the Stripe webhook
needs a credential in the `Authorization` header:

```http
Authorization: Bearer <access token or API key>
```

An **access token** is a short-lived JWT for a user session. An **API key** (`gt_…`) is a
long-lived secret for servers and scripts. What a credential may do is decided twice: its
**scopes** open groups of routes, and the user's **role** on each document decides what they
can do with it.

## Create the first account

Cloud has no sign-up endpoint. Create accounts in PostgreSQL with a bcrypt password hash, for
example with `pgcrypto`, run from `infra/` in the compose stack:

```sh
docker compose exec -T postgres psql -U gotipe -d gotipe <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO users (email, name, password_hash)
VALUES ('ada@example.com', 'Ada Lovelace', crypt('a-long-passphrase', gen_salt('bf', 12)));
SQL
```

New accounts are on the `free` plan. With Stripe configured, paid subscriptions set the plan;
without it, set `users.plan` to `starter`, `pro`, `business` or `enterprise` yourself. See
[quotas](/docs/cloud/rest-api#quotas).

## Access tokens

```sh
curl -X POST https://api.example.com/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type": "password", "email": "ada@example.com", "password": "a-long-passphrase"}'
```

```json
{ "access_token": "eyJhbGciOiJFUzI1NiIs…", "token_type": "Bearer", "expires_at": "2026-11-12T13:00:00Z" }
```

- The token is an ES256 JWT with the configured issuer and audience, valid for `JWT_EXPIRY`
  (1 hour by default). There are no refresh tokens: ask for a new one before `expires_at`.
- A password token carries the scopes `documents:read`, `documents:write`, `export:use`,
  `ai:use` and `account:manage`.
- The account's plan is read from the database on every request, so plan changes apply at
  once.
- Wrong credentials answer `401 UNAUTHORIZED` with the message `Invalid credentials`. If the
  database cannot be reached, the answer is `503`, not `401`.
- The endpoint accepts 10 requests per minute per client address.

To end a session, revoke the token you are using:

```sh
curl -X POST https://api.example.com/v1/auth/revoke \
  -H "Authorization: Bearer $GOTIPE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

A token can only revoke itself; the revocation lasts until the token would have expired.

## API keys

Create a key with a token that has `account:manage`. A key can only get scopes its creator has.

```sh
curl -X POST https://api.example.com/v1/api-keys \
  -H "Authorization: Bearer $GOTIPE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Export worker", "scopes": ["documents:read", "export:use"], "expires_at": "2027-01-01T00:00:00Z"}'
```

```json
{
  "id": "0b7c6a52-3f0e-4c1e-9f7a-5d2b8e4c1a90",
  "name": "Export worker",
  "prefix": "gt_live_",
  "key": "gt_live_sk_3f9a…",
  "scopes": ["documents:read", "export:use"],
  "created_at": "2026-11-12T12:00:00Z"
}
```

- The key is `gt_live_sk_` (in `production`) or `gt_test_sk_` (in `development`) followed by
  64 hex characters. It is shown once; Cloud stores only its SHA-256 hash.
- `expires_at` (RFC 3339) is optional. Expired keys stop working and are deleted by the hourly
  cleanup.
- `GET /v1/api-keys` lists your keys with `prefix`, `scopes`, `last_used_at` and `expires_at`;
  `DELETE /v1/api-keys/{id}` deletes one at once.
- Send a key as the bearer credential, or exchange it for an access token with
  `{"grant_type": "api_key", "api_key": "gt_live_sk_…"}` on `/v1/auth/token`. The token gets the
  key's scopes. Give browsers tokens, never keys.

## Scopes

| Scope | Opens |
|---|---|
| `documents:read` | `GET` on `/v1/documents` and everything under it |
| `documents:write` | Other methods under `/v1/documents`, and the `/sync` WebSocket |
| `export:use` | `/v1/exports` |
| `ai:use` | `/v1/ai/complete` |
| `account:manage` | `/v1/api-keys`, `/v1/organizations`, `/v1/billing` |
| `admin` | Everything. It cannot be granted through the API. |

`/v1/users/me` and `/v1/auth/revoke` need no scope. A missing scope answers `403 FORBIDDEN`.

## Document roles

The user who creates a document is its **owner**. Others get a role per document.

| Role | Can |
|---|---|
| `viewer` | Read the document, its comments and versions; export it; use it as AI context; delete own comments |
| `commenter` | Also comment, reply and resolve |
| `editor` | Also change the title and content, create and restore versions, join real-time editing |
| `admin` | Also list and grant permissions, including `admin` |
| owner | Also delete the document, revoke permissions and delete any comment |

A document the user cannot reach answers `404 NOT_FOUND`, the same as one that does not
exist. Ownership cannot be transferred.

## Share a document

An admin or the owner grants a role by the person's email; the person must have an account.

```sh
curl -X PUT https://api.example.com/v1/documents/$DOCUMENT_ID/permissions \
  -H "Authorization: Bearer $GOTIPE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "grace@example.com", "role": "editor"}'
```

```json
{ "status": "granted", "user_id": "5e0d…", "role": "editor" }
```

Granting again changes the role. `GET …/permissions` lists who has access;
`DELETE …/permissions/{userId}` removes it and is reserved for the owner.

## Organizations

An organization is a named group of accounts. Its creator is its owner and an `admin` member.

```sh
curl -X POST https://api.example.com/v1/organizations \
  -H "Authorization: Bearer $GOTIPE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Acme Docs", "slug": "acme-docs"}'
```

The slug is 1–100 characters of `a-z`, `0-9` and `-`, not starting or ending with `-`, and
unique. Members have the role `viewer`, `commenter`, `editor` or `admin`. Only admins add
members (by email, upsert) or remove them; the owner cannot be removed or demoted. Members
can read the organization and its member list. See [REST API](/docs/cloud/rest-api#organizations).

> [!NOTE]
> In this release organizations only group people: membership does not give access to
> documents, and quotas follow each user's own plan. Share documents per person with
> permissions.

## Revocation and live sessions

- Revoked token IDs are kept in Valkey until the token expires. If Valkey cannot be reached,
  requests with access tokens fail with `503` instead of skipping the check.
- A deleted API key stops working on the next request.
- An API key, and the account of an access token, are looked up in the database on every
  request. If the database cannot be reached, the request fails with `503`: a `401` always
  means that the credential itself is wrong.
- Open `/sync` connections re-check the credential and the editor role every 15 seconds and on
  every message, and close at the token's expiry. See [Real-time sync](/docs/cloud/realtime).
- The login limit (10 attempts a minute) counts each client address. Behind a reverse proxy,
  list the proxy in `TRUSTED_PROXIES` so the API reads the client from `X-Forwarded-For`; the
  compose stack does this for Caddy. Headers from any other sender are ignored.
- Revocations live in Valkey, which must not evict keys: the stock `infra/valkey/valkey.conf`
  uses `maxmemory-policy noeviction`. When Valkey is full the API answers `503` instead of
  dropping a revocation. See [Valkey](/docs/cloud/overview#valkey).

> [!NOTE]
> Not in this release: sign-up, password change or reset, OAuth or SSO, refresh tokens, and an
> endpoint for document-restricted tokens.

## Related

- [REST API](/docs/cloud/rest-api)
- [GoTipe Cloud](/docs/cloud/overview)
- [Security](/docs/resources/security)
