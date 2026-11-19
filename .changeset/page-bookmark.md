---
"@gotipe/block-editor": patch
---

`PageEditorHandle.bookmark(point?, bias?)` keeps a place (the caret's by default) that follows edits
until `release()`: `resolve()` gives `{ blockId, offset }` now, or `null` once the text around it or
its block is gone; text typed right at it goes before it (`"after"`, default) or after it
(`"before"`). `markdownOffset(point, bias?)` gives a point's offset in `getMarkdown()`'s text, past
or before a mark's delimiters at its edge. Types `PageBookmark`, `TextPoint`.
