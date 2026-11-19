---
"@gotipe/react": patch
"@gotipe/block-editor": patch
---

`afterBlock?: { blockId, node } | null` on `EditorContent`, `Editor`, `BlockEditor` and
`PageEditor` (type `BlockSlot`): the host's element in the flow of the document right after the
top-level block that is or holds `blockId`, spaced as one more block, so the text below moves down
for it (a field for writing with a model between paragraphs, say). A widget (`.gotipe-block-slot`,
`data-gotipe-widget`): not part of the text, offsets or file; it keeps its element as it moves to
another block. In `PageEditor` its keys and input stay the host's, as with an inline page icon.
