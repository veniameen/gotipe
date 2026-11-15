---
"@gotipe/versions": minor
---

`VersionsManager` can be filled from storage. `exportState()` returns
`{ version: 1, versions }` — every version, oldest first, detached and ready for JSON — and
`loadState(snapshot)` reads it back, as `CommentsManager` and `SuggestionsManager` do; the
new `initialState` option loads one when the manager (or `defineVersions`) is created. The
whole snapshot is checked first: an unknown format, a repeated ID, an empty name, an
unreadable date or an invalid document throws `VALIDATION_ERROR` and changes nothing.
Loaded versions are ordered by `createdAt`, the newest `maxVersions` are kept, and auto-save
compares the document with the newest one. New exported type: `VersionsSnapshot`.
