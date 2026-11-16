---
"@gotipe/core": minor
---

The host decides where a link opens: `host.openLink(href, info)` gets the link's own `target`
in `info.target` (`"_self"`, `"_blank"` or another stored value, `null` when the document
stores none, as for a file block's name). Cmd/Ctrl+click, a middle click and any click in
read-only mode still ask for a new tab (`newTab: true`); a link with `target: "_self"` no
longer looks the same to the host as any other. `editor.openLink(href, { target })` passes a
target too. Without `host.openLink` nothing changes: the editor opens a new tab and does not
read `target`.
