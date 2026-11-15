---
"@gotipe/block-editor": patch
"@gotipe/theme": patch
"@gotipe/i18n": patch
---

`PageEditor` handles an editor that cannot be created — Markdown it cannot read, a document that
fails its check. The failure no longer rejects unhandled and the page no longer shows the loading
shape forever: it shows "The document could not be opened" (`state.failed`, with Russian words)
in the place of the editor, marked like an image that cannot be shown, and passes the failure once
to `onError` and `host.onError` as a `GoTipeError`. A reason that is not one becomes
`EDITOR_NOT_INITIALIZED` with the reason as `details.cause`. Without either callback it is logged.
A creation that fails after the page is gone reports nothing.
