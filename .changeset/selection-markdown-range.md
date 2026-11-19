---
"@gotipe/markdown": patch
"@gotipe/block-editor": patch
---

`textOffsetToMd(map, blockId, offset, bias?)` takes a `bias` like `mdOffsetToText`: at the edge of
a mark, `"after"` (default, as before) stands past its delimiters, `"before"` before them, so the
end of a selected `**bold**` no longer takes the closing `**`. New `textRangeToMd(map, from, to)`
maps a text range to `{ start, end }` in the Markdown with no delimiters at its edges.
`PageEditorHandle.selectionMarkdownRange()` returns the editor's selection as such a range in
`getMarkdown()`'s text (selected blocks whole; `null` when the selection is not in the file).
