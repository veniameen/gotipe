# @gotipe/theme

## 0.1.5

### Patch Changes

- c4b13c7: A proposed new block's text stands in a span of its own (`.gotipe-sug-block-ins-text`, an inline
  decoration over the phantom block's text), and `--gt-sug-block-ins-text-tint` (`0%`) tints it in
  the lane's colour behind the text alone, line by line; with `--gt-sug-block-ins-tint: 0%` a host
  fills the text instead of the whole row. A stale one stays unfilled. Defaults look as before.
- `--gt-sug-ins-radius` (unset: `--gt-radius-inline`): the corners of an inserted text's fill, and
  `--gt-sug-block-ins-text-radius` (unset: `--gt-sug-ins-radius`): those of the fill behind a
  proposed new block's text. Read with fallbacks, so each can be set on any element above the text.
- `--gt-table-head-min-width` (`auto`): the least width of a header cell, a floor for columns sized
  by their content; a host's own `th { min-width }` still wins.
- A review whose proposals are still written (`theme/review/live.css`), nothing of it by default:
  `--gt-sug-live-caret-width` (unset: none) draws a typing caret at the end of a growing
  proposal's text (`.gotipe-sug-live`) in `--gt-sug-live-caret-color` (unset: the lane's colour),
  as a shadow that takes no room; `--gt-lane-cursor-move` (unset: the fast duration) is the time
  the cursor of a growing proposal takes to its text's new end (`.gotipe-lane-cursor[data-glide]`,
  nothing under reduced motion); a compact cursor's flag (`[data-compact]`) is one line, its name
  and label `--gt-lane-chip-gap` apart (unset: `--gt-space-1`), and when its cursor says it has
  no room right of it (`[data-chip-side="left"]`) it stands left of the cursor, above the row
  (`--gt-lane-chip-flip-x`, unset: at the cursor; `--gt-lane-chip-flip-y`, unset:
  `--gt-toolbar-gap`). Each is read with a fallback, so it can be set on any element above the
  page.
- The docs view's outline rules ask for the view before they look for the outline
  (`.gotipe-block-editor:where([data-gt-view="docs"]):has(> .gotipe-outline)`, the same weight
  and the same look). In the other views the browser no longer restyles the whole page when an
  element is added to the text or removed from it (a suggested block, a mark, a decoration),
  which took about 100 ms on a page of 7,400 blocks.
- 484513c: The page title with an inline icon (`iconPlacement="inline"`): its accessible name is the title's
  text alone (the prompt when it is empty), no longer prefixed by the icon's own name, and the empty
  title's prompt starts after the icon instead of under it (`--gt-page-icon-inline` +
  `--gt-page-icon-inline-gap`, as the text).
- 2c6a867: The pointer lane cursor (`reviewLaneCursor="pointer"`) is placed and drawn by the host:
  `--gt-lane-pointer-at` (`0px`) sets where the tip stands in the row (`100%` is its bottom) and the
  name chip moves with it; `--gt-lane-pointer-outline` (`currentColor`) and
  `--gt-lane-pointer-outline-width` (unset: `--gt-icon-stroke`) outline the built-in arrow, for
  instance in the page's colour. `PageEditor`'s `reviewLanePointer?: ReactNode` draws the host's own
  arrow instead of the built-in one (`span.gotipe-lane-pointer`, in the lane's colour), and
  `--gt-lane-pointer-tip-x`/`-tip-y` (unset: the built-in arrow's 3/16 and 1.75/16 of the size) say
  where its tip lies in its box. Defaults draw the cursor as in 0.1.4.
- 0ea7f50: `--gt-list-item-text-inset` (`0px`): a list item's content alone moves in from where it starts (its
  text, and a task's box with it), while its dot and number stay, as `li { padding-left }` does;
  `--gt-list-item-inset` still moves the whole item, its marker too. An empty item's prompt follows
  the text.
- a5b9de4: A suggestion that edits a list item opens its card at that row's marks (`.gotipe-sug-del`,
  `.gotipe-sug-ins`) instead of at the whole changed list; a block stands for the card only when the
  text has no mark. `--gt-review-card-gap` (8 px) sets the card's space to its row above or below it.
  - @gotipe/core@0.1.5

## 0.1.4

### Patch Changes

- 2fde80e: `PageEditor`'s `reviewLaneCursor?: "caret" | "pointer"` (default `"caret"`, today's caret with a
  flag): `"pointer"` draws a lane's cursor as an arrow pointer at the same place, its name chip below
  right of the tip, in the lane's colour (`.gotipe-lane-cursor[data-variant="pointer"]`,
  `.gotipe-lane-pointer`). Tokens `--gt-lane-pointer-size` (16 px), `--gt-lane-pointer-chip-x`
  (10 px), `--gt-lane-pointer-chip-y` (14 px), `--gt-lane-pointer-chip-radius`
  (`var(--gt-radius-inline)`). `ReviewLayer` takes `laneCursor`; type `ReviewLaneCursor`; `PageIcon`
  has a `pointer` glyph.
- 10078d3: `--gt-list-item-inset` (default `0px`): a list item's inset from the list's edge; its dot, number
  or task box moves with its text.
- 10078d3: Tokens for the empty media block as a row (`media.placeholder: "row"`):
  `--gt-media-row-label-size` (default `var(--gt-ui-size)`, 13 px) for its label, and
  `--gt-media-row-button-size` (`var(--gt-ui-size)`), `--gt-media-row-button-pad`
  (`var(--gt-button-pad)`) and `--gt-media-row-button-min-w` (`auto`) for its button. Today's look
  by default.
- 10078d3: `--gt-sug-del-active-fill` (unset: the lane's active tint, as today): the fill of a proposed
  deletion's struck text while its card is open, apart from the insertion's.
- 10078d3: `--gt-sug-replace-gap` (default `0px`): space between a struck deletion and the insertion that
  follows it in a replacement (`.gotipe-sug-del + .gotipe-sug-ins`).
- 10078d3: `--gt-table-head-tracking` (default `normal`): letter spacing of table header cells.

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
  `--gt-page-icon-inline-gap`), outside the title's text and the file.
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
