---
title: Security
description: Content Security Policy, HTML and URL handling, personal data in AI requests, GoTipe Cloud's protections, and how to report a vulnerability.
---

This page lists what GoTipe does to keep untrusted content inert and what your application
still owns: storage, credentials, network access and the policies of your pages.

## Content Security Policy

The JS engine and `PageEditor` work under a strict policy. This one is tested with the library
in a separate production build:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'none'
```

| Directive | Why |
|---|---|
| `script-src 'self'` | Enough for the JS engine: no `eval`, no workers, no WASM. Import from `@gotipe/core/js` (or alias `@gotipe/core` to it) so the bundle has no WASM at all. |
| `script-src 'wasm-unsafe-eval'` | Needed for the WASM engine, real-time collaboration and PDF/DOCX export. |
| `style-src 'unsafe-inline'` | The editor sets `style` attributes: menu and cursor positions, colors, cell alignment. |
| `img-src data:` | Images uploaded without host storage, and those your `resolveAsset` returns, are `data:` URLs. |
| `font-src` | The theme declares no `@font-face`; it uses the fonts in `--gt-font-ui` and `--gt-font-mono`. |
| `connect-src` | The editor makes no requests of its own. Add your Cloud API, `wss:` sync host and AI endpoints. |

GoTipe never widens a policy for you. A development server with hot reload is no proof that a
production build passes; test the built pages.

## HTML input and output

No GoTipe package inserts an HTML string into the page. HTML that comes in — pasted content
and `setContent(html)` — is parsed with `DOMParser` into a detached document and converted to
blocks from an allowlist of elements. `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`,
`<template>`, `<noscript>` and form inputs are dropped; only known inline formats, safe links,
safe image sources and safe colors survive.

HTML that goes out — `exportToHtml`, `serializeHtml`, `renderToHtml` — is built from the
document structure with escaped text and validated URLs and colors. The one exception is the
`blockRenderers` option of `renderToHtml`: their HTML is inserted as you return it.

## URLs, colors and links

- `toSafeHref(href)` from `@gotipe/core` accepts `http:`, `https:`, `mailto:` and relative URLs.
  It removes whitespace and control characters before reading the scheme, so a `javascript:`
  scheme split by a tab or a line break is rejected too.
- Image sources also accept base64 `data:` URLs of PNG, JPEG, GIF and WebP; SVG and other
  `data:` types are rejected.
- `toSafeColor(value)` accepts hex colors, color names and `rgb()`/`hsl()` values, and rejects
  anything else, such as `url()` or `var()`.
- Links never navigate on a plain click. Cmd/Ctrl+click, or any click in read-only mode, goes to
  `host.openLink`; without a host the editor opens the URL with `noopener,noreferrer`. An unsafe
  URL reports a `LINK_BLOCKED` error instead.
- Uploaded images must be PNG, JPEG, GIF or WebP. A `javascript:` or `vbscript:` URL returned by
  `host.saveAsset` is refused. Without host storage, files up to 10 MiB are embedded as `data:`
  URLs; your host owns storage, access control and the URLs `resolveAsset` returns.

## Exports and migration

PDF and DOCX export never fetch URLs, read files, discover system fonts or run code from the
document. Images come from your `resolveImage` callback, which owns credentials and access
checks; decoding is limited in size and memory. Headers and footers are plain text. Unknown
blocks, marks and unsafe links fail the export instead of passing through. The migration
converters never load URLs or parse HTML.

## AI and personal data

`@gotipe/ai` has no network client: your `AiProvider` decides where text goes. Keep provider
keys on a server — the [Cloud AI endpoint](/docs/cloud/rest-api#ai) is one such proxy.

With `enablePiiDetection: true` (off by default), the AI extension refuses to send a prompt or
context that contains an email address, a phone number of 10 or more digits, or a card number
that passes the Luhn check. It blocks the request with an error rather than redacting text, so
document positions stay valid. `detectPii(text)` runs the same check:

```ts title="pii.ts"
import { detectPii } from "@gotipe/ai";

const matches = detectPii("Write to ada@example.com or call +1 415 555 0100.");
// [{ pii_type: "Email", start: 9, end: 24, matched_text: "ada@example.com" },
//  { pii_type: "Phone", start: 33, end: 48, matched_text: "+1 415 555 0100" }]
```

It is a guard for common patterns, not a privacy classifier: names, addresses and other
identifiers pass. The Cloud AI endpoint does not run it.

## GoTipe Cloud

- Passwords are checked against bcrypt hashes. API keys are stored as SHA-256 hashes and shown
  once.
- Access tokens are ES256 JWTs; issuer, audience, expiry, token ID and subject are all checked.
  Revocation fails closed: when Valkey is unreachable, requests with access tokens answer
  `503`.
- Every route checks its scope, then the user's role on the document. A document you cannot
  access answers `404`, as if it did not exist.
- `/sync` takes the credential in a WebSocket subprotocol, never in the URL, re-checks access
  every 15 seconds and on every message, and accepts only exact origins.
- CORS allows exact origins only. REST responses carry `Content-Security-Policy`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and a referrer policy.
- Rate limits, body size limits and idempotency keys bound repeated and oversized requests.
- Object storage stays private; exports are downloaded through signed URLs valid for an hour.
- Stripe webhooks are verified by signature before they are stored.
- The audit log records document, comment, version, permission, API key, export, organization
  and billing actions with the user and the client address. It is kept 90 days for accounts on
  the free plan. Request logs record the method, path, status, latency, request ID and client
  address, never query strings or credentials.

### Before you expose a deployment

> [!WARNING]
> The defaults are not safe for a public deployment until you go through this list.

- Set `HTTP_ALLOWED_ORIGINS` and `SYNC_ALLOWED_ORIGINS` to your own origins; the production
  defaults and the compose file name GoTipe's domains.
- The stock `infra/valkey/valkey.conf` evicts keys under memory pressure (`allkeys-lru`),
  which can drop token revocations and idempotency keys. Use `noeviction`.
- `/readyz` is public and includes dependency error messages. Keep it, the metrics port
  (`9090`) and the monitoring profile's Prometheus and Grafana (admin password `admin` by
  default) off the public network.
- The login limit counts the socket's peer address; behind a proxy, limit per client there.

## Report a vulnerability

Email **security@gotipe.com**. Do not open a public issue for a security problem.

| Phase | Target |
|---|---|
| Acknowledgment | Within 24 hours |
| Assessment | Within 72 hours |
| Fix | Within 7 days for critical issues, 30 days for medium and low |
| Disclosure | After the fix is released |

In scope: the Rust crates, the TypeScript packages, the Cloud server and the infrastructure
files in the repository. Out of scope: third-party dependencies (report them upstream), the
documentation site and social engineering. `SECURITY.md` in the repository is the policy of
record.

## Related

- [Authentication](/docs/cloud/auth)
- [Host contract](/docs/concepts/host)
- [Media](/docs/extensions/media)
- [AI overview](/docs/ai/overview)
