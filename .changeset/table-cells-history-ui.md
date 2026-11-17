---
"@gotipe/core": minor
"@gotipe/react": minor
"@gotipe/vue": minor
"@gotipe/block-editor": minor
"@gotipe/versions": minor
"@gotipe/markdown": minor
"@gotipe/export": patch
"@gotipe/theme": patch
"@gotipe/i18n": patch
---

Merged table cells (Atlas frame 29) and the version history panel (Atlas frame 30).

**@gotipe/core.** `editTable` gains `mergeCells` (a rectangle between two grid positions into its top-left cell; the other cells' text follows line by line, with marks) and `splitCell` (one cell per position again; the text stays top-left). Inserting and deleting rows and columns now works on tables with merged cells: a span the edit passes through grows or shrinks, a cell whose top row is deleted moves down with its ID and text, and `deleteRow`/`deleteColumn` take an optional `count`, applied as one step. The edit is planned on a copy of the grid and checked before anything is written (no overlap, nothing past the last row, every cell in its column, no empty position after a structural edit; short rows are filled first), the staged result is compared with the plan, and every edit is one undo step on both engines. `insertRow` at index 0 keeps the header rows on top. The old "Unmerge table cells before changing its structure" error is gone. A stored table whose spans reach past the last row or overlap is laid out as browsers draw it and stays editable; its next edit writes the spans as drawn. One span rule everywhere: a whole number from 1 to 1000, anything else is 1. `repairTable` repairs a table (HTML import and clipboard clipping use it) and `normalizeTableGeometry(document)` returns the steps that repair every table of a document, for collaboration. Grid positions must be whole numbers. New pure helpers: `tableGrid`, `cellRange`, `rangeCells`, `headerRows`, `columnEdges`, `cellSpan` and their types. The Rust core has the same edits as `gotipe_core::table::edit_table` with the same JSON action; the default Rust schema declares the table's `colWidths`.

**@gotipe/react, @gotipe/vue.** `EditorContent` draws `colspan`/`rowspan`, puts header rows (and the rows a header reaches into) in `<thead>` and one `<col>` per grid column. React adds a selection of cells (drag, Shift+click, Shift+arrows from a cell's edge; Delete empties the cells, Escape ends it), width handles on the cell ending each column, ⌘⇧M merges or splits, the number of selected cells is announced, and exports `useTableLayout`, `useTableCell`, `TABLE_CELLS_KEY` and `TableMergeGuardProvider` (a host's reason not to merge).

**@gotipe/block-editor.** The column and row menus get a “Cells” (“Ячейки” in Russian) group: Merge cells (with two or more cells selected) and Split cell (in a merged cell); an unavailable row is paler and gives its reason as a tooltip. `PageEditor` offers merging only where Markdown keeps the table. A header over several columns has no column type and deletes all its columns. After a menu action the document has the focus again, so ⌘Z undoes it. New `VersionHistory` panel: versions grouped by day with author, time and words added and removed; the chosen version is compared with the page block by block (added, removed and changed blocks with a rule in the margin, removed text struck through, changed words shown); Restore restores in one undo step, answers with a toast that undoes it, and puts the restored entry on top; on a narrow container the list and the comparison are two screens. Data from a `VersionsManager` or host-provided versions, with loading, error and empty states; arrow keys, Home/End and Escape. The panel reads the page only while open and once typing pauses.

**@gotipe/versions.** `compareDocuments` no longer reports every sibling after an inserted or removed block as moved: a block is moved only when its parent changes or its order among the siblings both versions share. New helpers `diffText`, `countWordChanges` and `blockText`.

**@gotipe/markdown, @gotipe/export.** A table with merged cells has no GFM form and is now written as an HTML table (TS and Rust writers byte for byte) and read back as the same table by both parsers, instead of losing its spans. A table whose first row is empty is written by both writers. DOCX writes row spans as vertical merges, with filler cells for short rows, instead of failing; PDF, DOCX and Markdown share the span rule. HTML and PDF already kept spans; parity cases were added.

**@gotipe/theme, @gotipe/i18n.** `table-cells.css` and `history.css` with the history tokens; strings for the Cells group and the history panel in English and Russian.
