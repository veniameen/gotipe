---
"@gotipe/block-editor": patch
---

`PageEditor` passes the host's `discardAsset` on to the editor; it used to drop it, so a file
stored for a paste that was then not inserted stayed with the host. A test now fails when
`EditorHost` gains a member the page does not pass on.
