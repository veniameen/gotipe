---
"@gotipe/sdk": minor
---

`GoTipeClient` catches up with the Cloud server: comment replies, comment `metadata` and
idempotency keys.

- `replyToComment(docId, commentId, { content }, options?)` calls
  `POST /v1/documents/{docId}/comments/{commentId}/replies` and resolves to the reply
  (`ApiComment` with `parentId`, `resolved: false`). The reply takes `anchorType` and `blockId`
  from the comment it answers.
- `addComment` takes `metadata`, an object the server stores and returns with the comment as
  sent; nested keys are not renamed.
- Every call that changes data takes a last `options` argument, the new exported type
  `RequestOptions`, whose `idempotencyKey` is sent as the `Idempotency-Key` header:
  `createDocument`, `updateDocument`, `deleteDocument`, `createVersion`, `restoreVersion`
  (the key goes with the restore, not with the document read after it), `addComment`,
  `replyToComment`, `resolveComment`, `deleteComment`, `createExportJob` and `aiGenerate`.
  Repeating a call with the same key and arguments within 24 hours returns the first result
  instead of applying the change twice; the same key for a different request, or while the
  first is still running, rejects with `CONFLICT` (409). A key must be 1–255 visible ASCII
  characters; any other value is a `TypeError` before the request. Without a key nothing
  changes: no header is sent.
