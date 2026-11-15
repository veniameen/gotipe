---
"@gotipe/block-editor": patch
"@gotipe/i18n": patch
---

The error toast shows `PROPOSAL_STALE`, a suggestion that can no longer be accepted or rejected
because the text around it changed, in the interface's language («Предложение устарело» —
«Текст вокруг него изменился.»), not with the engine's English reason. New block editor keys
`error.proposalStale` and `error.proposalStaleDetail`. `EXTENSION_ERROR` and
`COMPOSITION_CONFLICT` stay out of the toast by design and reach the `error` event,
`host.onError` and the console.
