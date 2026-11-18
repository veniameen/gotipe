# @gotipe/theme

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
