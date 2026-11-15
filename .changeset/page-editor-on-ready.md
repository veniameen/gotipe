---
"@gotipe/block-editor": patch
---

`PageEditor` calls `onReady` and applies `autoFocus` once per editor. A new `onReady` function
on a later render no longer calls it again, drops the pending `onChange` draft or moves the
caret to the end of the page; `useCallback` is no longer needed.
