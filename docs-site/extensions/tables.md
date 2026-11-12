---
title: Tables
description: Table nodes with a header row, column widths and alignment, and atomic structural edits through editTable.
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

A header row is a first row made of `tableHeader` cells.

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
| `{ type: "insertRow", index }` | Inserts an empty row of plain cells at `index` (0 to the row count). |
| `{ type: "deleteRow", index }` | Deletes a row. Deleting the only row deletes the table. |
| `{ type: "insertColumn", index }` | Inserts a column at `index` (0 to the column count) in every row; a header row gets a header cell. The new column is 160 px wide and unaligned. |
| `{ type: "deleteColumn", index }` | Deletes a column from every row, with its width and alignment. Deleting the only column deletes the table. |
| `{ type: "resizeColumn", index, width }` | Sets a column width. The width is rounded and kept between 64 and 1600 px. |

`editTable` checks everything before it writes. It throws a `GoTipeError` with the code `VALIDATION_ERROR` when the table no longer exists, the index is out of range, a width is not finite, a row lacks the cell to delete, or the table has merged cells.

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
| Left / Right on a column resize handle | Narrow or widen the column by 16 px |
| Escape during a resize drag | Cancel the resize |

Tab in the last cell does not add a row.

## In the editor UI

`BlockEditor` and `PageEditor` draw the table in a horizontally scrolling area, with:

- a bar under the table that adds a row and a bar on its right that adds a column;
- a resize handle on every column of the first row; a drag commits one undo step;
- a menu on each header cell: column type, add a row, add a column, delete the column;
- a menu on the first cell of each body row: add a row above or below, delete the row.

A table without a header row has no column menus.

## Markdown

A table is a GFM table. The first row is always written as the header row, and `align` is written as `:---`, `:---:` and `---:`. A line break in a cell is `<br>`, and `|` in a cell is escaped.

```md
| Package | Version | Ready |
| :--- | ---: | :---: |
| core | 0.1.0 | yes |
```

Column widths, cell spans and per-cell `align` are not part of GFM and are not written.

## Merged cells

> [!NOTE]
> Merged cells (`colspan` or `rowspan` above 1) can enter a document from pasted HTML, an HTML `content` string or a migrated document. They are kept, but structural edits are blocked: `editTable` throws "Unmerge table cells before changing its structure", and there is no command that unmerges cells. The React views draw such cells unmerged, Markdown drops the spans, and DOCX export fails on row spans. HTML and PDF export keep them.

## Related

- [Commands](/docs/concepts/commands): `setBlockAttrs` and the chain.
- [Transactions](/docs/concepts/transactions): why one structural change is one undo step.
- [Markdown](/docs/conversion/markdown): the table mapping and its limits.
- [Menus](/docs/ui/menus): the column and row menus.
