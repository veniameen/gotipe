import { type BlockView, type GoTipeEditor, editTable, headerRows, tableGrid } from "@gotipe/core";
import { blockEditorEn } from "../i18n/en";
import { blockEditorRu } from "../i18n/ru";

/**
 * Column types are read from and written to Markdown cell content and
 * alignment. «Число» — right alignment `---:`; «Код» — every body cell in
 * backticks; «Да / нет» — cells `✓` and `—`, the same in every interface
 * language; «Текст» — as is.
 */
export type ColumnType = "text" | "code" | "number" | "boolean";

/**
 * Words for yes and no that a «Да / нет» column of an earlier version may hold: it wrote the
 * interface language's word. The block editor's own dictionaries (`table.yes`, `table.no`) are
 * always read; pass a host dictionary's words to read them too.
 */
export interface BooleanWords {
  yes: string;
  no: string;
}

const YES = "✓";
const NO = "—";
const DICTIONARIES = [blockEditorEn, blockEditorRu];
/** Values switching a column to «Да / нет» turns into `✓` or `—`; other values stay. */
const TRUTHY = /^(?:✓|✔|да|yes|true|1|\+|x|y)$/i;
const FALSY = /^(?:—|-|нет|no|false|0|n|)$/i;

const normal = (value: string) => value.trim().toLowerCase();

/** The exact values a «Да / нет» cell means: the marks and the dictionaries' words. */
function booleanValues(extra?: BooleanWords): { yes: Set<string>; no: Set<string> } {
  const words = (key: "table.yes" | "table.no", mark: string, own?: string) =>
    new Set(
      [mark, ...DICTIONARIES.map((table) => table[key]), own ?? ""].filter(Boolean).map(normal),
    );
  return { yes: words("table.yes", YES, extra?.yes), no: words("table.no", NO, extra?.no) };
}

type Align = "left" | "right" | "center" | null;

function cellText(cell: BlockView): string {
  return Array.isArray(cell.content) ? cell.content.map((s) => s.text).join("") : "";
}

function isFullyCode(cell: BlockView): boolean {
  return (
    Array.isArray(cell.content) &&
    cell.content.length > 0 &&
    cell.content.every((s) => s.text.length === 0 || s.marks.some((m) => m.type === "code"))
  );
}

export function findTable(editor: GoTipeEditor, tableId: string): BlockView | null {
  const visit = (blocks: BlockView[]): BlockView | null => {
    for (const b of blocks) {
      if (b.id === tableId) return b;
      const inner = visit(b.children);
      if (inner) return inner;
    }
    return null;
  };
  return visit(editor.getViewState().blocks);
}

/** The body cells of one column: a cell merged over several columns belongs to none of them. */
function bodyCells(table: BlockView, column: number): BlockView[] {
  const grid = tableGrid(table);
  const head = Math.max(
    headerRows(grid),
    table.children[0]?.children.some((c) => c.type === "tableHeader") ? 1 : 0,
  );
  return grid.cells
    .filter((cell) => cell.row >= head && cell.column === column && cell.columns === 1)
    .map((cell) => cell.node);
}

/**
 * A column of `✓` and `—` is «Да / нет»; so is one of an earlier version's words (`yes`, `да`,
 * a host's `yes` and `no`). `yes` and `no` are a host dictionary's words to read besides.
 */
export function columnTypeOf(
  table: BlockView,
  column: number,
  yes?: string,
  no?: string,
): ColumnType {
  const align = (table.attrs.align as Align[] | undefined)?.[column] ?? null;
  const cells = bodyCells(table, column).filter((c) => cellText(c).length > 0);
  if (cells.length > 0 && cells.every(isFullyCode)) return "code";
  if (align === "right") return "number";
  const values = booleanValues(yes !== undefined && no !== undefined ? { yes, no } : undefined);
  const known = (value: string) => values.yes.has(value) || values.no.has(value);
  if (cells.length > 0 && cells.every((c) => known(normal(cellText(c))))) return "boolean";
  return "text";
}

/**
 * Rewrites one column in one transaction. «Да / нет» stores `✓` and `—`, not a word of the
 * interface language: yes-like values (`yes`, `да`, `true`, `1`, `x`, `✔`, the dictionaries'
 * and `words`' yes) become `✓`, no-like and empty ones `—`; other values stay.
 */
export function setColumnType(
  editor: GoTipeEditor,
  tableId: string,
  column: number,
  type: ColumnType,
  words?: BooleanWords,
): void {
  const table = findTable(editor, tableId);
  if (!table) return;
  const steps: Record<string, unknown>[] = [];
  const values = booleanValues(words);
  const align = [...((table.attrs.align as Align[] | undefined) ?? [])];
  const width = Math.max(align.length, tableGrid(table).columns);
  while (align.length < width) align.push(null);
  align[column] =
    type === "number" ? "right" : align[column] === "right" ? null : (align[column] ?? null);
  steps.push({ type: "setBlockAttrs", blockId: table.id, attrs: { align } });
  for (const cell of bodyCells(table, column)) {
    const text = cellText(cell);
    if (type === "code") {
      if (text.length > 0 && !isFullyCode(cell)) {
        steps.push({
          type: "addMark",
          blockId: cell.id,
          from: 0,
          to: text.length,
          mark: { type: "code", attrs: {} },
        });
      }
    } else if (isFullyCode(cell) && text.length > 0) {
      steps.push({
        type: "removeMark",
        blockId: cell.id,
        from: 0,
        to: text.length,
        markType: "code",
      });
    }
    if (type === "boolean") {
      const value = normal(text);
      const next =
        values.yes.has(value) || TRUTHY.test(value)
          ? YES
          : values.no.has(value) || FALSY.test(value)
            ? NO
            : null;
      if (next !== null && next !== text) {
        if (text.length > 0)
          steps.push({ type: "deleteText", blockId: cell.id, from: 0, to: text.length });
        steps.push({ type: "insertText", blockId: cell.id, offset: 0, text: next, marks: [] });
      }
    }
  }
  editor.dispatch({ steps });
}

export function addRow(editor: GoTipeEditor, tableId: string): void {
  const table = findTable(editor, tableId);
  if (table) editTable(editor, tableId, { type: "insertRow", index: table.children.length });
}

/** A new row at `index` (0 — above the first row); the header rows stay on top. */
export function insertRow(editor: GoTipeEditor, tableId: string, index: number): void {
  editTable(editor, tableId, { type: "insertRow", index });
}

/** The row away; the table's last row takes the table with it. */
export function deleteRow(editor: GoTipeEditor, tableId: string, row: number): void {
  editTable(editor, tableId, { type: "deleteRow", index: row });
}

export function addColumn(editor: GoTipeEditor, tableId: string, after: number): void {
  editTable(editor, tableId, { type: "insertColumn", index: after + 1 });
}

/** The column away, or every column a merged header spans, in one step. */
export function deleteColumn(
  editor: GoTipeEditor,
  tableId: string,
  column: number,
  count = 1,
): void {
  editTable(editor, tableId, { type: "deleteColumn", index: column, count });
}
