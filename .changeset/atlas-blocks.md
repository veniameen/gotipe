---
"@gotipe/react": minor
"@gotipe/theme": minor
"@gotipe/i18n": minor
"@gotipe/block-editor": patch
---

Review the document's blocks against the GoTipe Atlas (frames 9, 10, 11, 17 and the new frame 18).

- Tables add a column from a bar to the right of the table and a row from a bar under it. The
  bars appear under the pointer or while the caret is in the table, and live outside the
  scrolling area (`.gotipe-table-scroll`), so a scrollbar never covers them. A wide table fades
  at the edge that hides columns, and adding a column brings it into view. A table no longer
  scrolls by a few pixels because of the last column's width handle. A cell is a text field
  and has no focus ring.
- Embeds and formulas have views: an embed is a card with its site and address, or asks for an
  address; a formula shows its TeX centred and is edited as text. Hosts can still pass their
  own block views.
- Empty tasks, list items, quotes and toggles always say what they will become; an empty
  paragraph only under the caret.
- Images and files speak the editor's language. A file's size follows the locale. An image
  that fails to load shows its own state; a file that cannot be reached marks its card. Empty
  images and files offer upload and a link right on the block. The image tools sit in the
  image's corner again.
- The checkbox and the hollow bullet draw their ring with a border, so it stays one line on
  1x screens. The theme's focus ring and tooltips replace the browser's everywhere. Hidden
  tooltips take no room. New tokens: `--gt-table-add`, `--gt-table-add-gap`,
  `--gt-table-fade`, `--gt-icon-small`.
