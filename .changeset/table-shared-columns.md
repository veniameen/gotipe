---
"@gotipe/react": patch
"@gotipe/vue": patch
"@gotipe/theme": patch
---

Table columns without a stored width share the text column instead of being drawn 160 px wide:
such a column has a bare `<col>`, and the table (`.gotipe-table-shared`) fills the text column,
each shared column at least `--gt-cell-min`; past that the table scrolls in its own box. Tables
whose widths are all stored look as before. A resize starts from the drawn width and, in a table
with shared columns, keeps the others shared. `TableLayout.widths` is now `(number | null)[]`.
