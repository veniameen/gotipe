# @gotipe/core

## 0.1.4

### Patch Changes

- 4649fd9: `EditorHost.discardAsset` is now called on every path where `saveAsset` stored a file the editor
  did not insert: pastes and drops through the image paste rule (a newer paste, a changed document
  or selection, read-only, destroyed, a refused or failed file of the same paste) and the image and
  file blocks' upload, replace, crop and placeholder drop (the block is gone, the editor is read-only
  or destroyed, a newer upload superseded it, or the block's source changed). A document changed
  during an image paste is reported as `ASSET_SAVE_FAILED`, not `CLIPBOARD_FAILED`. New export
  `discardSavedAsset(editor, asset)` from `@gotipe/core`.

## 0.1.3

### Patch Changes

- 2c3dccb: A reliable first focus:

  - `editor.focus(position)` puts the caret at `position` before the `focus` event and emits the
    `selectionChange` of that move after it (it used to emit `selectionChange` first).
  - `PageEditor`'s `autoFocus` comes after `onReady` and after every effect of the render `onReady`
    causes, so a host that keeps the editor in state and subscribes in an effect hears `focus` and
    then `selectionChange`, under StrictMode too. It no longer depends on a frame, which under load
    could come before the host's subscription.

- ec77da1: `editor.batch(fn)` makes every change committed while `fn` runs one undo step, on both
  engines and with collaboration: Undo restores the document and the selection from before
  the first change, Redo restores all of them. Events and filters still run per transaction;
  a nested batch joins the outer one; typing before and after a batch stays a step of its own.
  `@gotipe/wasm` joins a change marked `metadata.typing: "group"` to the open step of its
  collaboration history.

  `PageEditor`'s `insertBlock` from the title and the image and file blocks that replace an
  empty paragraph are one undo step; they used to take two.

- Updated dependencies [ec77da1]
  - @gotipe/wasm@0.1.2

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
