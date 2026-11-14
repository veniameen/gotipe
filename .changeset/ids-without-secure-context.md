---
"@gotipe/core": minor
"@gotipe/comments": patch
"@gotipe/suggestions": patch
"@gotipe/versions": patch
"@gotipe/ai": patch
"@gotipe/collaboration": patch
"@gotipe/migration": patch
"@gotipe/block-editor": patch
---

The library works on a page served over plain HTTP. `crypto.randomUUID()` exists only in a
secure context (HTTPS, localhost), and several places called it directly, so a page at
`http://intranet/…` failed with `crypto.randomUUID is not a function` — `CommentsManager` and
`SuggestionsManager` already in their constructors, `PageEditor` on a file without a title.

**@gotipe/core.** New export `createId()`: a UUID v4 from `crypto.randomUUID()` where the page
has it and from `crypto.getRandomValues()` where it does not; without either it throws instead of
making weak IDs. Every package of the library creates its IDs with it: blocks made by commands,
HTML import and paste, comments and replies, suggestions and tracked changes, versions, AI
paragraphs and suggestions, the collaboration peer ID, `PageEditor`'s title and the default
`createId` of `@gotipe/migration`. `createEditor` still installs `crypto.randomUUID` on such a page
for code of the host that calls it.
