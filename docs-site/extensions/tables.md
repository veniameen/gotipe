---
title: Tables
description: Table nodes with header rows, column widths and alignment, merged cells, and atomic structural edits through editTable.
packages: ["@gotipe/core", "@gotipe/block-editor"]
---

A table is a `table` block of `tableRow` blocks, each holding `tableHeader` or `tableCell` blocks with rich text. Structural changes (rows, columns, widths) go through one function, `editTable`, which plans every affected cell into one validated transaction: one change, one undo step.

```demo
tables
```

The `Table` extension is in `DefaultPreset`, `FullPreset` and `PageEditor`. It comes from `@gotipe/core` (MIT); the column type helpers and the column and row menus belong to `@gotipe/block-editor`, which is commercial.

## Nodes

| Node | Content | Attribute | Type | Default | Description |
| --- | --- | --- | --- | --- | --- |
| `table` | `tableRow` children | `colWidths` | `number[]` | — | Column widths in pixels. A missing entry means 160. |
| | | `align` | `("left" \| "center" \| "right" \| null)[]` | — | Alignment of each column. |
| `tableRow` | `tableCell` or `tableHeader` children | — | — | — | — |
| `tableHeader`, `tableCell` | Rich text | `colspan` | `number` | `1` | Columns the cell spans. |
| | | `rowspan` | `number` | `1` | Rows the cell spans. |
| | | `align` | `string` | — | Alignment of this cell. |

A header row is a first row made of `tableHeader` cells. Several rows of header cells at the top are all header rows.

Spans follow HTML: a cell takes `colspan` columns and `rowspan` rows from the first free position of its row, and the positions it covers have **no cell of their own** in the rows and columns after it. A span is a whole number from 1 to 1000; anything else (2.7, 0, a negative, above 1000) counts as 1. Every reader and writer uses this rule: the grid, HTML, Markdown, PDF and DOCX. A stored table is laid out as browsers draw it: a cell over rows stops at the last row, and a cell over columns stops before a position a cell from above covers. Such a table stays editable, and its next edit writes the spans as drawn.

## Insert a table

```ts title="table.ts"
import { createEditor } from "@gotipe/core";
import { Paragraph, Table } from "@gotipe/core/extensions";

const editor = await createEditor({ extensions: [Paragraph, Table] });
editor.chain().insertTable({ rows: 3, cols: 3, withHeader: true }).run();
```

| Command | Description |
| --- | --- |
| `insertTable({ rows, cols, withHeader })` | Inserts an empty table after the current block. `rows` and `cols` must be positive integers with at most 5,000 cells in all, otherwise the command throws `TRANSFORM_ERROR`. `withHeader` makes the first row a header row. |
| `goToNextCell()` | Moves to the next cell in reading order and selects its text. |
| `goToPrevCell()` | Moves to the previous cell and selects its text. |

The "/" menu lists **Table** and inserts a 3 × 3 table with a header row.

## Change the structure

```ts title="table.ts"
import { createEditor, editTable } from "@gotipe/core";
import { Paragraph, Table } from "@gotipe/core/extensions";

const editor = await createEditor({ extensions: [Paragraph, Table] });
editor.chain().insertTable({ rows: 3, cols: 3, withHeader: true }).run();
const tableId = editor.getJSON().blocks.find((block) => block.type === "table")!.id;

editTable(editor, tableId, { type: "insertColumn", index: 1 });
editTable(editor, tableId, { type: "resizeColumn", index: 1, width: 240 });
editTable(editor, tableId, { type: "deleteRow", index: 2 });
```

`editTable(editor, tableId, action)` returns `true` when the change is committed and `false` when the editor is read-only or destroyed, or a transaction filter cancels it.

| Action | Description |
| --- | --- |
| `{ type: "insertRow", index }` | Inserts an empty row of plain cells at `index` (0 to the row count). A row never goes above the header rows: index 0 in a table with a header lands under them. A cell over rows that the new row passes through grows by one row. |
| `{ type: "deleteRow", index, count? }` | Deletes `count` rows (default 1) from `index` in one step. A cell over several rows shrinks; if its top row goes, the cell moves down to the next row with its text and ID. Deleting every row deletes the table. |
| `{ type: "insertColumn", index }` | Inserts a column at `index` (0 to the column count) in every row; a header row gets a header cell. A cell over several columns that the new column passes through grows by one column. The new column is 160 px wide and unaligned. |
| `{ type: "deleteColumn", index, count? }` | Deletes `count` columns (default 1) from `index` in one step, with their widths and alignment. A cell over several columns shrinks. Deleting every column deletes the table. |
| `{ type: "resizeColumn", index, width }` | Sets a column width. The width is rounded and kept between 64 and 1600 px. |
| `{ type: "mergeCells", from, to }` | Merges the rectangle between two grid positions (`{ row, column }`, counted from 0) into its top-left cell. The other cells' text follows the top-left cell's, each on a new line (a line break, `\n`), with its marks. The caret goes to the end of the merged cell. |
| `{ type: "splitCell", row, column }` | Splits the merged cell over this grid position back into one cell per position. The text stays in the top-left cell; the new cells are empty and of the same kind (header or body). |

`editTable` plans the whole edit on a copy of the table's grid and checks it before it writes: no two cells may overlap, no cell may reach past the last row, every cell must stay in its column, and after a structural edit every position has a cell. A structural edit on a table with short rows fills them with empty cells first. The staged result is compared with the plan, so the JS and WASM engines write the same table, and every edit is one undo step.

It throws a `GoTipeError` with the code `VALIDATION_ERROR` when the table no longer exists, an index or position is out of range or not a whole number, a width is not finite, a merge range cuts through a merged cell or holds a single cell, or a split targets a cell that is not merged. Nothing is written then.

The Rust core has the same edits as `gotipe_core::table::edit_table`, with the same JSON form of the action. The TypeScript planner (applied by the JS and the WASM engine) and the Rust planner run the shared cases in `crates/gotipe-core/tests/fixtures/table-edits.json`.

### Repair

`repairTable(table, { fill?, createId? })` returns a table with a valid grid: spans as drawn, and with `fill` (the default) an empty cell in every position that has none. HTML import and copying part of a table use it without `fill`. `normalizeTableGeometry(document, { createId? })` returns the steps that repair every table of a document (none when all are valid); collaboration runs it after a remote update, as it repairs inline atoms.

## Widths and alignment

Column widths live in the table's `colWidths` array and alignment in its `align` array, one entry per column. The editor UI aligns every cell of a column by `align`. Set alignment with `setBlockAttrs`:

```ts
editor.chain().setBlockAttrs(tableId, { align: ["left", null, "right"] }).run();
```

## Column types

`@gotipe/block-editor` gives columns a type that lives in the cells themselves, so it survives Markdown without an extra attribute:

| Type | Stored as |
| --- | --- |
| `text` | Cells as they are |
| `number` | Right alignment (`---:` in Markdown) |
| `code` | Every body cell in inline code |
| `boolean` | Body cells reading the UI words for yes and no (`yes`/`no` in English) |

```ts title="column-type.ts"
import { columnTypeOf, setColumnType } from "@gotipe/block-editor";

setColumnType(editor, tableId, 2, "number", { yes: "yes", no: "no" });
```

`setColumnType` rewrites one column in one transaction. Switching to `boolean` turns values such as `true`, `1`, `x` and `✓` into the yes word, and `false`, `0`, `-` or an empty cell into the no word. `columnTypeOf(table, column, yes, no)` reads the type back from a table's view block. The package also exports `addRow`, `insertRow`, `deleteRow`, `addColumn` and `deleteColumn`, thin wrappers over `editTable` used by its menus.

## Keyboard

| Key | Action |
| --- | --- |
| Tab | Next cell, with its text selected |
| Shift+Tab | Previous cell, with its text selected |
| Enter | Cell below; nothing in the last row |
| Shift+Enter | Line break inside the cell |
| Shift+Left / Right / Up / Down at a cell's edge | Selects cells together, then extends the selection by a cell |
| Delete / Backspace with cells selected | Empties the selected cells, in one step |
| Escape with cells selected | Ends the cell selection |
| ⌘⇧M (Ctrl+Shift+M) | Merges the selected cells; in a merged cell, splits it |
| Left / Right on a column resize handle | Narrow or widen the column by 16 px |
| Escape during a resize drag | Cancel the resize |

Tab in the last cell does not add a row. Tab skips the positions a merged cell covers: they have no cell of their own.

## In the editor UI

`BlockEditor` and `PageEditor` draw the table in a horizontally scrolling area, with:

- a bar under the table that adds a row and a bar on its right that adds a column;
- a resize handle on every column, in the topmost cell whose right edge is the column's (under a header over two columns, the cell below carries the first column's handle); a drag commits one undo step;
- a menu on each header cell: column type, cells, add a row, add a column, delete the column. A header over several columns has no type, and its delete takes all its columns;
- a menu on the first cell of each body row: add a row above or below, cells, delete the row;
- a selection of cells: drag across cells, Shift+click a cell, or Shift+arrows from the edge of a cell's text. Selected cells take the selection colour.

The **Cells** group of both menus has **Merge cells**, available while two or more cells are selected, and **Split cell**, available when the menu's cell or the caret's cell is merged. An unavailable row is paler and says why in its tooltip; both rows show ⌘⇧M. Screen readers hear how many cells are selected. A host can refuse merging in a table with `TableMergeGuardProvider` from `@gotipe/react`: `PageEditor` refuses it where Markdown could not keep the merged table (see below), and the menu says so.

All renderers draw the spans: `EditorContent` of `@gotipe/react` (MIT), the `BlockEditor`/`PageEditor` views and the Vue renderer. Header rows and every row a header reaches into go in `<thead>`, and one `<col>` per grid column carries the width. `@gotipe/react` exports `useTableLayout()` (the grid, the selected cells and `select()`) and `useTableCell(id)` for custom cell views.

A table without a header row has no column menus.

## Markdown

A table is a GFM table. The first row is always written as the header row, and `align` is written as `:---`, `:---:` and `---:`. A line break in a cell is `<br>`, and `|` in a cell is escaped.

```md
| Package | Version | Ready |
| :--- | ---: | :---: |
| core | 0.1.0 | yes |
```

Column widths are not part of GFM and are not written. A table with merged cells has no GFM form: it is written as an HTML `<table>` block, one cell per line, with its spans, header cells, alignment and inline formatting (bold, italic, underline, strikethrough, code, sub/superscript, links, text colour and highlight). Reading that HTML back gives the same table again, so write → read → write keeps the bytes. Other HTML stays a raw block, byte for byte.

What an HTML table cannot hold keeps only its text: mentions, inline formulas, custom emoji, inline images, font face and size, link titles. A merged table inside a list or quote reads back as raw HTML. `PageEditor` therefore offers **Merge cells** only for a top-level table without such marks.

## Merged cells

```ts title="merge.ts"
editTable(editor, tableId, { type: "mergeCells", from: { row: 1, column: 0 }, to: { row: 2, column: 1 } });
editTable(editor, tableId, { type: "splitCell", row: 1, column: 0 });
```

Merged cells may also come from pasted HTML, an HTML `content` string or a migrated document. Every structural edit keeps them valid (see the table of actions). Export keeps the spans: HTML as `colspan`/`rowspan`, PDF as one box over the merged area, DOCX as `gridSpan` and vertical merges (with filler cells for short rows), Markdown as an HTML table that reads back as the table. Two replicas that merge and split cells at the same time converge, and an undo on one reaches the other.

To read the layout, `tableGrid(table)` from `@gotipe/core` returns the grid: `rows`, `columns`, `cells` with their positions and spans, `at(row, column)` and `find(id)`. `cellRange(grid, a, b)` widens a rectangle over every merged cell it cuts, which is what a merge needs.

## Related

- [Commands](/docs/concepts/commands): `setBlockAttrs` and the chain.
- [Transactions](/docs/concepts/transactions): why one structural change is one undo step.
- [Markdown](/docs/conversion/markdown): the table mapping and its limits.
- [Menus](/docs/ui/menus): the column and row menus.
