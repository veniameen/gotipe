---
"@gotipe/core": patch
"@gotipe/block-editor": patch
---

A reliable first focus:

- `editor.focus(position)` puts the caret at `position` before the `focus` event and emits the
  `selectionChange` of that move after it (it used to emit `selectionChange` first).
- `PageEditor`'s `autoFocus` comes after `onReady` and after every effect of the render `onReady`
  causes, so a host that keeps the editor in state and subscribes in an effect hears `focus` and
  then `selectionChange`, under StrictMode too. It no longer depends on a frame, which under load
  could come before the host's subscription.
