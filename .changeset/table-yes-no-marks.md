---
"@gotipe/block-editor": patch
---

The Yes / no column type stores `✓` and `—`, the same in every interface language, instead of
the interface's word for yes and no. Switching a column to it turns `yes`, `да`, `true`, `1`, `x`
or `✔` into `✓` and negative or empty values into `—`; other values stay. The words earlier
versions wrote — the block editor's dictionaries' `table.yes` and `table.no` (`yes`/`no`,
`да`/`нет`) and a host's own, which the column menu passes — still read as `✓` and `—`, so such a
column is still Yes / no. `setColumnType`'s `words` and `columnTypeOf`'s `yes` and `no` are now
optional: they name a host dictionary's words to read. New exported type `BooleanWords`.
