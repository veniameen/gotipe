---
title: SDK
description: "@gotipe/sdk — a small typed client for the GoTipe Cloud REST API, for browsers and Node."
packages: ["@gotipe/sdk"]
license: MIT
---

`GoTipeClient` wraps the most used [REST API](/docs/cloud/rest-api) calls: documents,
versions, comments and replies, export jobs, AI, organizations and usage. Every call that
changes data can send an [idempotency key](#safe-retries). It has no dependencies and uses the
global `fetch`, so it runs in browsers and in Node.

## Install

```sh
npm install @gotipe/sdk
```

## Create a client

```ts title="cloud.ts"
import { GoTipeClient } from "@gotipe/sdk";

const client = new GoTipeClient({
  baseUrl: "https://api.example.com",
  token: process.env.GOTIPE_TOKEN,
});

const created = await client.createDocument({
  title: "Launch plan",
  content: {
    version: 1,
    blocks: [{ id: "p1", type: "paragraph", attrs: {}, content: [{ text: "Draft", marks: [] }], children: [] }],
  },
});
await client.addComment(created.id, { blockId: "p1", content: "Who owns this?", from: 0, to: 5 });

const page = await client.listDocuments(1, 20);
console.log(page.total, page.hasMore, page.data.map((document) => document.title));
```

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | required | The API's address; trailing slashes are removed. |
| `token` | `string` | — | An access token, sent as `Authorization: Bearer`. |
| `apiKey` | `string` | — | An API key, used when there is no `token`. |
| `timeout` | `number` | `30000` | Milliseconds before a request is aborted; must be positive. |

The credential is fixed when the client is created. When a token expires, create a new client
with a fresh one. In browsers, pass short-lived access tokens, never API keys.

## Methods

| Method | REST call | Resolves to |
|---|---|---|
| `listDocuments(page = 1, perPage = 20)` | `GET /v1/documents` | `{ data, total, page, perPage, hasMore }`; `perPage` 1–100, otherwise a `RangeError` |
| `getDocument(id)` | `GET /v1/documents/{id}` | `Document` with `content` and `collaborationState` |
| `createDocument({ id?, title, content? }, options?)` | `POST /v1/documents` | `Document` |
| `updateDocument(id, { title?, content? }, options?)` | `PATCH /v1/documents/{id}` | `Document` without `content` |
| `deleteDocument(id, options?)` | `DELETE /v1/documents/{id}` | `undefined` |
| `listVersions(docId, { limit?, cursor? })` | `GET …/versions` | `{ data, hasMore, nextCursor? }`, newest first |
| `createVersion(docId, name, options?)` | `POST …/versions` | `Version` of type `named` |
| `restoreVersion(docId, versionId, options?)` | `POST …/versions/{versionId}/restore`, then `GET` | The restored `Document` |
| `listComments(docId, { includeResolved?, limit?, cursor? })` | `GET …/comments` | `{ data, hasMore, nextCursor? }`, oldest first, each comment with `resolved` |
| `addComment(docId, { content, blockId?, from?, to?, metadata? }, options?)` | `POST …/comments` | `ApiComment` |
| `replyToComment(docId, commentId, { content }, options?)` | `POST …/comments/{commentId}/replies` | `ApiComment` with `parentId` |
| `resolveComment(docId, commentId, options?)` | `POST …/comments/{commentId}/resolve` | `undefined` |
| `deleteComment(docId, commentId, options?)` | `DELETE …/comments/{commentId}` | `undefined` |
| `createExportJob(docId, format, options?)` | `POST /v1/exports` | `ExportJob` |
| `getExportJob(docId, jobId)` | `GET /v1/exports/{jobId}` | `ExportJob`; `docId` is not used |
| `aiGenerate(docId, request, options?)` | `POST /v1/ai/complete` | `AiResponse` |
| `getOrganization(id)` | `GET /v1/organizations/{id}` | `Organization` |
| `getUsage()` | `GET /v1/billing/usage` | `Usage` for the current month |

`listComments` and `listVersions` return one [page](/docs/cloud/rest-api#pages): `limit` is
1–100 (50 by default; another number is a `RangeError` before any request). Pass `nextCursor`
back as `cursor` until it is absent:

```ts
const comments = [];
let cursor: string | undefined;
do {
  const page = await client.listComments(documentId, { includeResolved: true, cursor });
  comments.push(...page.data);
  cursor = page.nextCursor;
} while (cursor);
```

A page continues after the previous page's last item, so a comment resolved or a version
created between the requests does not make the loop skip or repeat items. A response that
says `has_more` without a `next_cursor` rejects with `GoTipeApiError` code
`INVALID_RESPONSE` instead of ending the loop early.

`addComment` anchors the comment to text when `from` is set (then `blockId` and `to` are
required), to the block when only `blockId` is set, and to the document otherwise. Its
`metadata` is an object of your own, such as `{ label: "question" }`: the server stores it and
returns it with the comment as sent, nested keys unchanged.

`replyToComment` adds a reply to a thread. The reply takes `anchorType` and `blockId` from the
comment it answers, and its `parentId` names that comment; `listComments` returns replies as
separate items, so group them by `parentId`. A reply has only `content`: the server keeps no
`metadata` and no text offsets for it.

`format` is one of `html`, `markdown`, `plaintext`, `json`, `pdf` and `docx`; see
[Server-side conversion](/docs/conversion/server#cloud-export-jobs) for polling a job.

`aiGenerate` sends `stream: false` and waits for the whole answer. Its request has `prompt`
(required), `context`, `mode` (the command, default `"complete"`), `provider`, `model` and
`maxTokens`. Pass `""` as `docId` to skip the document check. For a streamed answer, call
`/v1/ai/complete` with `fetch` and read the events described in the
[REST reference](/docs/cloud/rest-api#ai).

## Safe retries

A call that changes data accepts `options` with `idempotencyKey`, sent as the
[`Idempotency-Key`](/docs/cloud/rest-api#idempotency-keys) header. When a call fails without an
answer — a timeout or a dropped connection — the change may or may not have happened. Repeat
the call with the same key and the same arguments: within 24 hours the server returns the
first result instead of applying the change twice.

```ts title="retry.ts"
import { GoTipeApiError, GoTipeClient } from "@gotipe/sdk";

const client = new GoTipeClient({ baseUrl: "https://api.example.com", token: accessToken });
const options = { idempotencyKey: crypto.randomUUID() };
const add = () =>
  client.addComment(documentId, { content: "Who owns this?", metadata: { label: "question" } }, options);

const comment = await add().catch((error) => {
  if (error instanceof GoTipeApiError && error.status !== 503) throw error;
  return add(); // no answer, or the outcome was not recorded: same key, same arguments
});
```

- Use a new random key for each change, such as a UUID: 1–255 visible ASCII characters. Any
  other key is a `TypeError` before the request. `crypto.randomUUID()` exists in Node and on
  HTTPS pages, not on plain HTTP. Keys belong to the account that sends them.
- Without a key, the SDK sends no `Idempotency-Key`, and a repeated call may apply the change
  twice.
- `CONFLICT` (409) means the key was used for a different request, the first request is still
  running or its outcome is unknown, or its answer was larger than 256 KiB and was not kept.
  Read the resource before you decide; do not repeat the change with a new key.
- `restoreVersion` sends the key with the restore and reads the document without it.
  `aiGenerate` accepts a key because it does not stream.

## Field names

The SDK renames top-level response fields from snake_case to camelCase: `size_bytes` becomes
`sizeBytes`, `collaboration_state` becomes `collaborationState`, `resolved_at` becomes
`resolvedAt`. Nested values stay as the server sends them — document content, comment
metadata, `AiResponse.usage` (`prompt_tokens`, `completion_tokens`) and `Usage.usage`
(`documents`, `ai_requests`, `exports`, each `{ current, limit }`). Request bodies are sent as
you pass them.

The package exports the types `GoTipeClientOptions`, `RequestOptions`, `PaginatedResponse`,
`CursorPage`, `PageOptions`, `ListCommentsOptions`, `Document`, `Version`, `ApiComment`,
`ExportJob`, `AiRequest`, `AiResponse`, `Organization`, `Usage` and `ApiError`.

## Errors

A response outside 2xx rejects with `GoTipeApiError`, which has the server's `code` and
`message` and the HTTP `status`; the server sends no other error fields. A body that is not the
error envelope gives the code `HTTP_ERROR`. A timeout or a network failure rejects with the error from `fetch`
(an `AbortError` for timeouts).

```ts title="errors.ts"
import { GoTipeApiError, GoTipeClient } from "@gotipe/sdk";

const client = new GoTipeClient({ baseUrl: "https://api.example.com", apiKey: process.env.GOTIPE_API_KEY });

try {
  await client.createExportJob("6f1c2b8e-0d1a-4f5e-9a63-2a7d1e0b9c44", "pdf");
} catch (error) {
  if (error instanceof GoTipeApiError && error.code === "QUOTA_EXCEEDED") {
    console.warn("Monthly export limit reached");
  } else {
    throw error;
  }
}
```

> [!NOTE]
> The SDK covers part of the API. Use the REST API directly for access tokens and
> revocation, `/v1/users/me`, API keys, document permissions, creating organizations and
> managing members, version descriptions and milestones, billing and streamed AI answers.
> The `Document` type also declares `collaborators` and `syncUrl`, which the server does not
> send.

## Related

- [REST API](/docs/cloud/rest-api)
- [Authentication](/docs/cloud/auth)
- [Real-time sync](/docs/cloud/realtime)
