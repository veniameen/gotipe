# @gotipe/theme

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

- f67955e: `PageEditor`'s `iconPlacement: "above" | "inline"` (default `"above"`): `"inline"` draws the page's
  glyph in the title's row before its text (`.gotipe-page-title-icon`, `--gt-page-icon-inline`,
  `--gt-page-icon-inline-gap`), outside the title's text and the file. `createPageBlockViews` takes
  `titleIcon`.
- f633ccf: More part tokens for a host, each with today's look as its default:

  - Tables: `--gt-table-line`, `--gt-table-row-rule`, `--gt-table-col-rule` and `--gt-table-frame`
    for the grid; `--gt-table-head-size`, `-leading`, `-weight`, `-color`, `-fill` and
    `--gt-table-head-line` for header cells; `--gt-cell-first-pad`, `--gt-table-row-height`;
    `--gt-table-code-size`, `--gt-table-code-pad`, `--gt-table-code-fill` for inline code in a
    cell; `--gt-table-shared-layout: auto` sizes columns without a stored width by their content.
  - The reset that drops the line under a table's last row weighs as much as the cell rule, so a
    host's own border rule on the cells wins over it.
  - Flow: `--gt-flow-after-h1-table`, `-h2-table`, `-h3-table` before a table under a heading,
    `--gt-flow-between-lists` before a list that follows a list, `--gt-list-item-gap` between items.
  - Suggestions: `--gt-sug-ins-line-mix`, `--gt-sug-block-ins-tint`,
    `--gt-sug-block-ins-underline(-thickness)`, `--gt-sug-stale-color`, `--gt-sug-stale-line`,
    `--gt-sug-stale-underline-style`, `--gt-sug-stale-underline-thickness`,
    `--gt-sug-stale-active-fill` and `--gt-sug-stale-check-line`.

- Updated dependencies [2c3dccb]
- Updated dependencies [ec77da1]
  - @gotipe/core@0.1.3

## 0.1.2

### Patch Changes

- 7103833: A suggested new list item stands as its own item. A pending one is no longer drawn over the
  previous item's bullet, and a stale edit that adds lines shows its blocks at the hint's place,
  quiet and dashed (`.gotipe-sug-block-ins.gotipe-sug-stale`), instead of its text at the end of
  the previous line.
- 7103833: Table columns without a stored width share the text column instead of being drawn 160 px wide:
  such a column has a bare `<col>`, and the table (`.gotipe-table-shared`) fills the text column,
  each shared column at least `--gt-cell-min`; past that the table scrolls in its own box. Tables
  whose widths are all stored look as before. A resize starts from the drawn width and, in a table
  with shared columns, keeps the others shared. `TableLayout.widths` is now `(number | null)[]`.
  `editTable` (both engines) keeps a column without a stored width as `null` in `colWidths`: a
  resize writes only that column's width, and inserting a row or a column no longer turns shared
  columns into 160 px ones.
- 7103833: - A list after a heading or a paragraph starts with the flow gap of the Atlas
  (`--gt-flow-after-h1/h2/h3`, `--gt-flow`); the list margin reset used to win over it and leave
  no gap.
  - `.gotipe-btn-secondary` has its own rule: quiet beside the primary answer, filled when it is the
    only button (a stale proposal's "Reject").
- 7103833: More of the look is reachable through tokens set on a container:

  - `--gt-comment-soft` and `--gt-ai-ghost` are no longer declared on `:root`: unset, their rules
    fall back to `--gt-comment-tint` and `--gt-text-3` where they are drawn, so base colours a host
    sets on a page container reach them; the host can still set either on any container. The new
    part colours below work the same way.
  - `data-gt-narrow="off"` on the editor root or any ancestor switches off the sizes of a narrow
    container (up to 640 px); the layout of a narrow container (docs outline, history screens,
    find bar) still applies.
  - New tokens, defaults equal to today's look: `--gt-check-fill`, `--gt-check-line`;
    `--gt-card-name-size`, `--gt-card-name-weight`, `--gt-card-button-size`; `--gt-sug-ins-bar`
    and `--gt-sug-ins-underline`, `-style`, `-thickness`, `-offset` (a text underline for a proposed
    insertion); `--gt-sug-changed-bar`, `--gt-sug-changed-bar-width`; `--gt-image-radius`,
    `--gt-image-ring`, `--gt-image-ring-color`, `--gt-caption-color`, `--gt-caption-size`,
    `--gt-caption-leading`, `--gt-image-empty-bg`.
  - Styles for `.gotipe-review-card-delete`, a `.gotipe-page-head` inside a page and
    `.gotipe-slash-menu-item-description`.

- Updated dependencies [5d8df93]
- Updated dependencies [7103833]
- Updated dependencies [7103833]
  - @gotipe/core@0.1.2
