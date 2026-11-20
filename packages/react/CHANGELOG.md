# @gotipe/react

## 0.1.5

### Patch Changes

- A suggested table (a `blocks` decoration) draws no line for screen readers after it: it selects
  no cells and changes nothing, so it has nothing to announce, and the line stood between the table
  and the next block, so that block was spaced by `--gt-flow` instead of a table's
  `--gt-flow-block`. The block after a suggested table (a row being written under a growing one,
  say) now stands as after a table. A page's own table keeps its line.

- 5110b7e: `afterBlock?: { blockId, node } | null` on `EditorContent`, `Editor`, `BlockEditor` and
  `PageEditor` (type `BlockSlot`): the host's element in the flow of the document right after the
  top-level block that is or holds `blockId`, spaced as one more block, so the text below moves down
  for it (a field for writing with a model between paragraphs, say). A widget (`.gotipe-block-slot`,
  `data-gotipe-widget`): not part of the text, offsets or file; it keeps its element as it moves to
  another block. In `BlockEditor` and `PageEditor` its keys and input stay the host's, as with an
  inline page icon.
- 7730811: The review card on a narrow page (`reviewCardPlacement`) is placed from its measured height:
  `"above"` keeps the card's bottom 8 px above the row for any card (it used to assume 188 px, so a
  short card hung far above its row and a tall one covered it), and `"below"` turns above the row by
  the same measured rule when the window has no room below. `@gotipe/react`'s `FloatingPlacement`
  gains `"top-start"`: above the anchor, aligned to its left edge, below it when there is no room.
- `EditorContent` draws a block that has decorations again only when its own decorations or its
  children are new objects: a change of another decoration layer, or of another block's
  decorations in the same layer, no longer draws it. A suggested block (a `blocks` decoration)
  that is the same object in a group that looks the same is not drawn again either, so of a
  growing group only the new and the changed blocks are drawn. A top-level block that only
  built-in or `pure` views draw (its suggested blocks too) gives React the element it gave last
  time while the block, the caret's place in it and the editor's being editable are the same,
  so a change of one block, or a host's own re-render, is not paid for by every block of a long
  page.
  - @gotipe/core@0.1.5

## 0.1.4

### Patch Changes

- 4649fd9: `EditorHost.discardAsset` is now called on every path where `saveAsset` stored a file the editor
  did not insert: pastes and drops through the image paste rule (a newer paste, a changed document
  or selection, read-only, destroyed, a refused or failed file of the same paste) and the image and
  file blocks' upload, replace, crop and placeholder drop (the block is gone, the editor is read-only
  or destroyed, a newer upload superseded it, or the block's source changed). A document changed
  during an image paste is reported as `ASSET_SAVE_FAILED`, not `CLIPBOARD_FAILED`. New export
  `discardSavedAsset(editor, asset)` from `@gotipe/core`.
- Updated dependencies [4649fd9]
  - @gotipe/core@0.1.4

## 0.1.3

### Patch Changes

- 9ca2225: Two host options of the image and file blocks (`media` on `PageEditor` and `BlockEditor`, or
  `MediaOptionsContext`), off by default:

  - `placeholder: "row"` draws an empty image or file block as one quiet row: a glyph, the block's
    kind ("Image", "File") and a secondary "Choose a file…" (`media.fileGroup`, `media.chooseFile`;
    sizes `--gt-media-row-h`, `-pad`, `-gap`, `-icon`, `-radius`, `-button-h`).
  - `captionName: true` shows an image's file name in the caption's place when it has no caption,
    quietly (`.gotipe-image-caption-hint`, `--gt-caption-hint-color`); nothing is written to the
    document.

- Updated dependencies [2c3dccb]
- Updated dependencies [9ca2225]
- Updated dependencies [ec77da1]
  - @gotipe/core@0.1.3
  - @gotipe/i18n@0.1.3

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

- abfad86: The image and file placeholders take options: `media={{ links, inlineErrors }}` on `BlockEditor`
  and `PageEditor` (or `MediaOptionsContext` from `@gotipe/react`). `links: false` hides "By link"
  (catalogs of `host.imageSources` stay); `inlineErrors: false` shows no failure text in the block,
  and the failures shown only there until now are reported instead: a wrong address as
  `LINK_BLOCKED`, an image changed during a crop as `ASSET_SAVE_FAILED`, a failed catalog search as
  `ASSET_RESOLVE_FAILED`. Both default to `true`: nothing changes.
- 7103833: Table columns without a stored width share the text column instead of being drawn 160 px wide:
  such a column has a bare `<col>`, and the table (`.gotipe-table-shared`) fills the text column,
  each shared column at least `--gt-cell-min`; past that the table scrolls in its own box. Tables
  whose widths are all stored look as before. A resize starts from the drawn width and, in a table
  with shared columns, keeps the others shared. `TableLayout.widths` is now `(number | null)[]`.
  `editTable` (both engines) keeps a column without a stored width as `null` in `colWidths`: a
  resize writes only that column's width, and inserting a row or a column no longer turns shared
  columns into 160 px ones.
- Updated dependencies [7103833]
- Updated dependencies [5d8df93]
- Updated dependencies [7103833]
- Updated dependencies [7103833]
  - @gotipe/i18n@0.1.2
  - @gotipe/core@0.1.2
