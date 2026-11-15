---
"@gotipe/core": minor
---

D-13, the rest of it:

- The JS engine adds one to `Document.version` for every applied step, as the WASM engine
  does: the same edits give the same `getJSON()` on both engines, version included. A
  rejected transaction leaves the version as it was; undo brings back the one from before.
- An extension whose `dependencies` names an extension that isn't in the list rejects
  `createEditor` with `EXTENSION_ERROR` (`details.extension`, `details.dependency`). Before,
  the dependency was skipped without a word and the extension was set up half-working.
- Without `host.openLink`, `editor.openLink(href, { newTab: false })` goes to the link in this
  tab. Before, the editor opened a new tab whatever `newTab` said; the default is still a new
  tab.
