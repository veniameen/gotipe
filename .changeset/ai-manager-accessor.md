---
"@gotipe/ai": minor
---

`getAiManager(editor)` returns the `AiManager` that `defineAi` created for the editor — the
one its commands, ghost text and `cancelAi` use — or `undefined` without the extension and
after the editor is destroyed. Host-driven calls through it use the extensions' provider and
run one at a time with their requests, and closing the command bar cancels them too. The
extension still owns the manager and releases it with the editor.
