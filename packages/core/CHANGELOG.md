# @gotipe/core

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

- 7103833: `saveAsset` reports a host `saveAsset` that throws anything but a `GoTipeError` as
  `ASSET_SAVE_FAILED`, with the asset's kind, name, media type, size and the cause in `details`.
  A pasted or dropped file whose save failed used to show "Could not use the clipboard"
  (`CLIPBOARD_FAILED`). A `GoTipeError` thrown by the host keeps its code.

  `EditorHost.discardAsset({ src, name, kind })` is called for a file `saveAsset` stored that a
  paste or drop then did not insert (a newer paste, a change during the upload, read-only, destroy,
  or another file of the same paste failing), so the host can delete it. Without it nothing changes.

- 7103833: Table columns without a stored width share the text column instead of being drawn 160 px wide:
  such a column has a bare `<col>`, and the table (`.gotipe-table-shared`) fills the text column,
  each shared column at least `--gt-cell-min`; past that the table scrolls in its own box. Tables
  whose widths are all stored look as before. A resize starts from the drawn width and, in a table
  with shared columns, keeps the others shared. `TableLayout.widths` is now `(number | null)[]`.
  `editTable` (both engines) keeps a column without a stored width as `null` in `colWidths`: a
  resize writes only that column's width, and inserting a row or a column no longer turns shared
  columns into 160 px ones.
- Updated dependencies [5d8df93]
  - @gotipe/markdown@0.1.2
