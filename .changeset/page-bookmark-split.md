---
"@gotipe/block-editor": patch
---

A page bookmark follows its text into the new block when its block is split (Enter) and into the
block before when two blocks are joined. A lost bookmark (its block gone or replaced) comes back
once its block's text is as it was, so it survives showing another version with `setMarkdown` and
restoring the current one, or an undo.
