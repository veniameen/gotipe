---
"@gotipe/block-editor": minor
"@gotipe/theme": minor
"@gotipe/i18n": minor
---

Rows of a table get their handle, and a wide page keeps its review cards in the margin (GoTipe
Atlas, frames 9 and 14).

- The row under the pointer shows a handle in the left margin; its menu adds a row above or below
  and deletes the row (`TableRowButton`, `insertRow`, `deleteRow`). The table's own handle stays at
  its first line, so the two never meet. The scrolling area reaches into the margin by
  `--gt-row-handle-room`, bounded by the page's padding.
- PageEditor on a wide page (`--gt-card-w` + `--gt-margin-gap` + `--gt-margin-page-min`) lays out
  as text and a margin column (`data-review-layout="margin"`): every proposal and comment has a
  card level with its text, the open one with its answers, the others folded to who and why. A
  narrow page opens one card by the text, as before.
- New i18n keys: `table.rowMenu`, `table.addRowAbove`, `table.addRowBelow`.
