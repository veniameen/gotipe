# @gotipe/markdown

## 0.1.3

### Patch Changes

- 27f2aba: `textOffsetToMd(map, blockId, offset, bias?)` takes a `bias` like `mdOffsetToText`: at the edge of
  a mark, `"after"` (default, as before) stands past its delimiters, `"before"` before them, so the
  end of a selected `**bold**` no longer takes the closing `**`. New `textRangeToMd(map, from, to)`
  maps a text range to `{ start, end }` in the Markdown with no delimiters at its edges.
  `PageEditorHandle.selectionMarkdownRange()` returns the editor's selection as such a range in
  `getMarkdown()`'s text (selected blocks whole; `null` when the selection is not in the file).

## 0.1.2

### Patch Changes

- 5d8df93: Typing in a long document is responsive: a key press in a Markdown page of about 7,400 blocks
  went from about 415 ms to about 30 ms to the next frame (Chromium, JS engine, one machine). The
  work of a key press no longer grows with the document:

  - `@gotipe/core`: the check for text the browser inserted after handled input reads only the
    blocks that changed; the JS engine copies only the blocks a transaction changes and keeps what
    it knows of the others (their text, decoded form and validity), and a state is parsed once;
    `before` and `after` of a `transaction` event are decoded when a listener reads them.
  - `@gotipe/react`: a block drawn by the built-in views is drawn again only when it changes, the
    caret enters or leaves it, or the editor becomes read-only or editable. A custom view is still
    drawn on every change unless it sets `pure` (`BlockViewComponent.pure`): then it draws only from
    its props, hooks and contexts and gets `selectedBlockId` only for its own block and those under
    it.
  - `@gotipe/markdown`: `serializeMarkdown(doc, snapshot, { fingerprints })` keeps the fingerprints
    of top-level blocks between calls for documents whose blocks are never changed in place. The
    written text is the same.
  - `@gotipe/block-editor`: `PageEditor` writes its draft from the editor's view with kept
    fingerprints; the table cell, page heading and raw Markdown views are `pure`.
