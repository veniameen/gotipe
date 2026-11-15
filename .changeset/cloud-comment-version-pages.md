---
"@gotipe/sdk": minor
---

`listComments` and `listVersions` read Cloud lists page by page instead of stopping at the
first 50 items. Both take `{ limit?, cursor? }` — `listComments` also `includeResolved?`, which
replaces its positional boolean — and resolve to a `CursorPage`: `{ data, hasMore, nextCursor? }`.
Pass `nextCursor` back as `cursor` to read the next page. A page continues after the previous
page's last item, so a comment resolved or a version created between the requests is neither
skipped nor repeated. A `limit` outside 1–100 is a `RangeError` before any request. New exported
types: `CursorPage`, `PageOptions`, `ListCommentsOptions`.
