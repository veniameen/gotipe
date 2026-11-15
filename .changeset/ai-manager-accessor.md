---
"@gotipe/ai": minor
---

`getAiManager(editor)` returns the `AiManager` that `defineAi` created for the editor — the
one its commands, ghost text and `cancelAi` use — or `undefined` without the extension and
after the editor is destroyed. Host-driven calls through it use the extensions' provider and
share its single running request: a command, closing the command bar or a document change
cancels the host's request (`AbortError`), and a host request cancels a running command. The
extension still owns the manager and releases it with the editor.
