---
"@gotipe/block-editor": patch
---

`PageEditor` fixes:

- A host `resolveAsset` that returns `null` now shows the image or file as unavailable, as
  `EditorHost` documents; the page used to fall back to the raw path and request it.
- `autoFocus` comes on the frame after `onReady`, so a host that starts listening in the render
  `onReady` causes sees the first focus and selection.
- `ref.insertBlock(kind)` with the caret in the page title inserts the block under the title
  instead of turning the title into it.
- A `review` without `comments` no longer re-renders in a loop ("Maximum update depth exceeded").
- An image or file placeholder whose source is not chosen yet is no longer written to the file as
  `![](<>)`; it becomes content once it has a source.
