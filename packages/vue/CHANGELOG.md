# @gotipe/vue

## 0.1.2

### Patch Changes

- 7103833: Table columns without a stored width share the text column instead of being drawn 160 px wide:
  such a column has a bare `<col>`, and the table (`.gotipe-table-shared`) fills the text column,
  each shared column at least `--gt-cell-min`; past that the table scrolls in its own box. Tables
  whose widths are all stored look as before. A resize starts from the drawn width and, in a table
  with shared columns, keeps the others shared. `TableLayout.widths` is now `(number | null)[]`.
  `editTable` (both engines) keeps a column without a stored width as `null` in `colWidths`: a
  resize writes only that column's width, and inserting a row or a column no longer turns shared
  columns into 160 px ones.
- Updated dependencies [5d8df93]
- Updated dependencies [7103833]
- Updated dependencies [7103833]
  - @gotipe/core@0.1.2
