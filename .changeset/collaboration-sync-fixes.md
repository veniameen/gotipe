---
"@gotipe/collaboration": patch
---

An invalid presence from one peer no longer stops the provider: that peer's caret is dropped and the problem is reported through `onError` while editing continues. `INVALID_AWARENESS` from the server is reported the same way. The local `user` is validated when the provider is created, and only `name`, `color` and `avatar` are sent.

Presence is sent only when the caret, the selection or the user changes, at most once per 100 ms after the change, so edits from other peers no longer resend it and several active peers stay under the server's message limit.

When GoTipe Cloud replaces a document's content (PATCH with content or a version restore) it answers `BASELINE_REPLACED`; the provider stops without retrying and calls the new `onBaselineReplaced` option (or `onError`) so the host can load the document again. A handshake from another baseline after a reconnect is recognized the same way instead of failing.

A `wsUrl` that is not an absolute `ws:`/`wss:` URL, credentials or a `token` in the URL, and an invalid `peerId` now throw from the constructor instead of being retried; a `SecurityError` or `SyntaxError` from the WebSocket constructor stops without retrying.
