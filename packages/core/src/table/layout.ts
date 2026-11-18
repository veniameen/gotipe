import { createId as newId } from "../document/id";
import { GoTipeError } from "../error";
import type { AttrValue, Block, TextSpan } from "../types/block";
import {
  type CellPosition,
  type CellRange,
  cellRange,
  rangeCells,
  sameRange,
  tableGrid,
} from "./grid";

/** A cell of the table being planned: where it stands and what it will hold. */
export interface PlannedCell {
  block: Block;
  fresh: boolean;
  row: number;
  column: number;
  rows: number;
  columns: number;
  /** Text appended to the cell, line by line: what merged cells held. */
  appended: TextSpan[][];
}
export interface PlannedRow {
  block: Block;
}
/** The planned table: rows, cells by grid position and the per-column attributes. */
export interface PlannedTable {
  rows: PlannedRow[];
  cells: PlannedCell[];
  columns: number;
  /** Each column's width; null for a column without one, which shares the text column. */
  widths: (number | null)[];
  align: AttrValue[];
  removed: boolean;
  /** Makes the ID of a new cell or row. */
  createId: () => string;
}

const DEFAULT_WIDTH = 160;
const fail = (message: string): never => {
  throw new GoTipeError("VALIDATION_ERROR", message);
};
function emptyCell(id: string, header: boolean): Block {
  return {
    id,
    type: header ? "tableHeader" : "tableCell",
    attrs: {},
    content: [],
    children: [],
  };
}

/**
 * Reads a table as its repaired grid: spans cut to the table and to the cells above. A structural
 * edit fills the holes of short rows so every position has a cell.
 */
export function planTable(
  table: Block,
  fill: boolean,
  createId: () => string = newId,
): PlannedTable {
  const grid = tableGrid(table);
  const plan: PlannedTable = {
    rows: table.children.map((block) => ({ block })),
    cells: grid.cells.map((cell) => ({
      block: cell.node,
      fresh: false,
      row: cell.row,
      column: cell.column,
      rows: cell.rows,
      columns: cell.columns,
      appended: [],
    })),
    columns: grid.columns,
    widths: Array.from({ length: grid.columns }, (_, index) => {
      const value = Array.isArray(table.attrs.colWidths) ? table.attrs.colWidths[index] : null;
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }),
    align: Array.from({ length: grid.columns }, (_, index) =>
      Array.isArray(table.attrs.align) ? (table.attrs.align[index] ?? null) : null,
    ),
    removed: false,
    createId,
  };
  if (fill)
    for (let row = 0; row < plan.rows.length; row++)
      for (let column = 0; column < plan.columns; column++)
        if (!covering(plan, row, column)) add(plan, row, column, headerRow(plan, row));
  return plan;
}

function covering(plan: PlannedTable, row: number, column: number): PlannedCell | undefined {
  return plan.cells.find(
    (cell) =>
      cell.row <= row &&
      row < cell.row + cell.rows &&
      cell.column <= column &&
      column < cell.column + cell.columns,
  );
}
function add(plan: PlannedTable, row: number, column: number, header: boolean): void {
  plan.cells.push({
    block: emptyCell(plan.createId(), header),
    fresh: true,
    row,
    column,
    rows: 1,
    columns: 1,
    appended: [],
  });
}
/** Every cell over the row is a header, and there is one. */
function headerRow(plan: PlannedTable, row: number): boolean {
  const over = plan.cells.filter((cell) => cell.row <= row && row < cell.row + cell.rows);
  return over.length > 0 && over.every((cell) => cell.block.type === "tableHeader");
}
/** Header rows at the top: rows whose own cells are all headers. */
function leadingHeaderRows(plan: PlannedTable): number {
  let count = 0;
  while (count < plan.rows.length) {
    const own = plan.cells.filter((cell) => cell.row === count);
    if (!own.length || own.some((cell) => cell.block.type !== "tableHeader")) break;
    count++;
  }
  for (const cell of plan.cells)
    if (cell.row < count) count = Math.max(count, cell.row + cell.rows);
  return count;
}

export function insertRow(plan: PlannedTable, at: number): void {
  // a new row never goes above the header: «Add row above» on the first row keeps it on top
  const index = Math.max(at, leadingHeaderRows(plan));
  for (const cell of plan.cells) {
    if (cell.row >= index) cell.row++;
    else if (cell.row + cell.rows > index) cell.rows++;
  }
  plan.rows.splice(index, 0, {
    block: { id: plan.createId(), type: "tableRow", attrs: {}, content: null, children: [] },
  });
  for (let column = 0; column < Math.max(1, plan.columns); column++)
    if (!covering(plan, index, column)) add(plan, index, column, false);
  plan.columns = Math.max(1, plan.columns);
}

export function deleteRow(plan: PlannedTable, index: number): void {
  plan.cells = plan.cells.filter((cell) => {
    if (cell.row === index) {
      if (cell.rows === 1) return false;
      cell.rows--;
    } else if (cell.row < index && cell.row + cell.rows > index) cell.rows--;
    else if (cell.row > index) cell.row--;
    return true;
  });
  plan.rows.splice(index, 1);
  if (!plan.rows.length) plan.removed = true;
}

export function insertColumn(plan: PlannedTable, index: number): void {
  const headers = plan.rows.map((_, row) => headerRow(plan, row));
  for (const cell of plan.cells) {
    if (cell.column >= index) cell.column++;
    else if (cell.column + cell.columns > index) cell.columns++;
  }
  plan.columns++;
  plan.rows.forEach((_, row) => {
    if (!covering(plan, row, index)) add(plan, row, index, headers[row]!);
  });
  // a table of stored widths gives a new column the default; one with shared columns, another
  const stored = plan.widths.length > 0 && plan.widths.every((width) => width !== null);
  plan.widths.splice(index, 0, stored ? DEFAULT_WIDTH : null);
  plan.align.splice(index, 0, null);
}

export function deleteColumn(plan: PlannedTable, index: number): void {
  plan.cells = plan.cells.filter((cell) => {
    if (cell.column === index) {
      if (cell.columns === 1) return false;
      cell.columns--;
    } else if (cell.column < index && cell.column + cell.columns > index) cell.columns--;
    else if (cell.column > index) cell.column--;
    return true;
  });
  plan.columns--;
  plan.widths.splice(index, 1);
  plan.align.splice(index, 1);
  if (!plan.columns) plan.removed = true;
}

function textOf(block: Block): TextSpan[] {
  return Array.isArray(block.content) ? block.content : [];
}

/** One cell over the rectangle; the others' text follows the top-left cell's, line by line. */
export function mergeCells(plan: PlannedTable, from: CellPosition, to: CellPosition): PlannedCell {
  const grid = tableGrid(planned(plan));
  const range: CellRange = {
    top: Math.min(from.row, to.row),
    left: Math.min(from.column, to.column),
    bottom: Math.max(from.row, to.row),
    right: Math.max(from.column, to.column),
  };
  if (range.top < 0 || range.left < 0 || range.bottom >= plan.rows.length)
    fail("Table position is out of range");
  if (range.right >= plan.columns) fail("Table position is out of range");
  if (!sameRange(cellRange(grid, from, to), range))
    fail("The range cuts through a merged cell; select the whole merged cell");
  const inside = rangeCells(grid, range).map(
    (cell) => plan.cells.find((entry) => entry.block.id === cell.node.id)!,
  );
  if (inside.length < 2) fail("Select at least two cells to merge");
  const [target, ...rest] = inside as [PlannedCell, ...PlannedCell[]];
  target.rows = range.bottom - range.top + 1;
  target.columns = range.right - range.left + 1;
  for (const cell of rest) {
    const spans = [...textOf(cell.block), ...cell.appended.flat()];
    if (spans.some((span) => span.text.length > 0)) target.appended.push(spans);
  }
  const gone = new Set(rest);
  plan.cells = plan.cells.filter((cell) => !gone.has(cell));
  return target;
}

/** The merged cell back to one cell per position; its text stays in the top-left one. */
export function splitCell(plan: PlannedTable, at: CellPosition): PlannedCell {
  const cell = covering(plan, at.row, at.column) ?? fail("Table position is out of range");
  // a cell whose stored span the grid had to cut is repaired: its span is written as drawn
  const stored = ["rowspan", "colspan"].some((name) => {
    const value = cell.block.attrs[name];
    return value !== undefined && value !== 1;
  });
  if (cell.rows === 1 && cell.columns === 1 && !stored) fail("The cell is not merged");
  const { row, column, rows, columns } = cell;
  cell.rows = 1;
  cell.columns = 1;
  for (let y = row; y < row + rows; y++)
    for (let x = column; x < column + columns; x++)
      if (y !== row || x !== column) add(plan, y, x, cell.block.type === "tableHeader");
  return cell;
}

/** The table the plan describes, cells in reading order with their spans. */
export function planned(plan: PlannedTable): Block {
  const spans = (cell: PlannedCell) => {
    const attrs = { ...cell.block.attrs };
    for (const [name, value] of [
      ["colspan", cell.columns],
      ["rowspan", cell.rows],
    ] as const) {
      if (value > 1 || attrs[name] !== undefined) attrs[name] = value;
    }
    return attrs;
  };
  return {
    id: "",
    type: "table",
    attrs: {},
    content: null,
    children: plan.rows.map((row, y) => ({
      ...row.block,
      children: plan.cells
        .filter((cell) => cell.row === y)
        .sort((a, b) => a.column - b.column)
        .map((cell) => ({ ...cell.block, attrs: spans(cell) })),
    })),
  };
}

/** The plan is a table HTML lays out at the same positions, with no gap and no overlap. */
export function checkPlan(plan: PlannedTable, complete: boolean): void {
  if (plan.removed) return;
  const grid = tableGrid(planned(plan));
  if (grid.problem) fail(grid.problem);
  for (const cell of plan.cells) {
    const placed = grid.find(cell.block.id);
    if (!placed || placed.row !== cell.row || placed.column !== cell.column)
      fail("The table edit would move cells out of their columns");
  }
  for (let row = 0; complete && row < grid.rows; row++)
    for (let column = 0; column < grid.columns; column++)
      if (!grid.at(row, column)) fail("The table edit would leave a position without a cell");
  if (grid.columns !== plan.columns) fail("The table edit would change the column count");
}
