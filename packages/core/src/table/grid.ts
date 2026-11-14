/**
 * The grid of a table as HTML lays it out: a cell takes `colspan` columns and `rowspan` rows from
 * the first free position of its row, and the positions it covers have no cell of their own.
 * Pure and shared by the editing planner, the renderers and the menus of every adapter.
 */

/** The part of a block or block view the grid reads. */
export interface TableNode {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  children: TableNode[];
}

/** A position in the grid, counted from zero. */
export interface CellPosition {
  row: number;
  column: number;
}

/** A rectangle of the grid, both corners included. */
export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export interface GridCell<T extends TableNode = TableNode> {
  node: T;
  /** The cell's top-left position. */
  row: number;
  column: number;
  rows: number;
  columns: number;
}

export interface TableGrid<T extends TableNode = TableNode> {
  rows: number;
  columns: number;
  /** Cells in reading order: by row, then by column. */
  cells: GridCell<T>[];
  /** The cell covering a position; null outside the table or in a hole of a short row. */
  at(row: number, column: number): GridCell<T> | null;
  find(cellId: string): GridCell<T> | null;
  /**
   * Why the stored table needed repair to be laid out: a span that is not an integer from 1 to
   * the limit, a cell over rows past the last row, or cells that overlap. The grid is laid out
   * repaired anyway, and the next table edit writes the repaired spans.
   */
  problem: string | null;
}

/** The largest span, HTML's limit for `colspan`. Every writer shares the rule of `cellSpan`. */
export const SPAN_LIMIT = 1000;

/**
 * A stored span: an integer from 1 to the limit — a number, or text that reads as one — and
 * anything else (2.7, 0, a negative, beyond the limit) counts as 1. The HTML, Markdown, PDF and
 * DOCX writers of both engines read spans by the same rule.
 */
export function cellSpan(value: unknown): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim() || "x")
        : Number.NaN;
  return Number.isInteger(number) && number >= 1 && number <= SPAN_LIMIT ? number : 1;
}

/**
 * Lays the table out as HTML does, repaired as browsers draw it: a cell over rows stops at the
 * last row, a cell over columns stops before a position a cell from above already covers.
 */
export function tableGrid<T extends TableNode>(table: T): TableGrid<T> {
  const rows = table.children.length;
  const cells: GridCell<T>[] = [];
  const cover: number[][] = Array.from({ length: rows }, () => []);
  const occupied: number[] = [];
  let columns = 0;
  let problem: string | null = null;
  table.children.forEach((row, y) => {
    let x = 0;
    for (const node of row.children as T[]) {
      while ((occupied[x] ?? 0) > y) x++;
      const wantRows = cellSpan(node.attrs.rowspan);
      const wantColumns = cellSpan(node.attrs.colspan);
      for (const name of ["rowspan", "colspan"]) {
        const stored = node.attrs[name];
        if (stored !== undefined && stored !== cellSpan(stored))
          problem ??= "A table cell has a span that is not a whole number from 1 to 1000";
      }
      let width = 0;
      while (width < wantColumns && (occupied[x + width] ?? 0) <= y) width++;
      const cell: GridCell<T> = {
        node,
        row: y,
        column: x,
        rows: Math.min(wantRows, rows - y),
        columns: width,
      };
      if (cell.rows < wantRows) problem ??= "A table cell reaches past the last row";
      if (cell.columns < wantColumns) problem ??= "Table cells overlap";
      const index = cells.push(cell) - 1;
      for (let column = x; column < x + cell.columns; column++) {
        occupied[column] = y + cell.rows;
        for (let line = y; line < y + cell.rows; line++) cover[line]![column] = index;
      }
      x += cell.columns;
      columns = Math.max(columns, x);
    }
  });
  const ids = new Map(cells.map((cell) => [cell.node.id, cell]));
  return {
    rows,
    columns,
    cells,
    problem,
    at: (row, column) => {
      const index = cover[row]?.[column];
      return index === undefined ? null : cells[index]!;
    },
    find: (cellId) => ids.get(cellId) ?? null,
  };
}

/** The smallest rectangle that holds both positions and every cell it cuts through. */
export function cellRange(grid: TableGrid, a: CellPosition, b: CellPosition): CellRange {
  const range = {
    top: Math.max(0, Math.min(a.row, b.row)),
    left: Math.max(0, Math.min(a.column, b.column)),
    bottom: Math.min(grid.rows - 1, Math.max(a.row, b.row)),
    right: Math.min(grid.columns - 1, Math.max(a.column, b.column)),
  };
  for (let grown = true; grown; ) {
    grown = false;
    for (const cell of rangeCells(grid, range)) {
      const next = {
        top: Math.min(range.top, cell.row),
        left: Math.min(range.left, cell.column),
        bottom: Math.max(range.bottom, cell.row + cell.rows - 1),
        right: Math.max(range.right, cell.column + cell.columns - 1),
      };
      if (sameRange(next, range)) continue;
      Object.assign(range, next);
      grown = true;
    }
  }
  return range;
}

export function sameRange(a: CellRange, b: CellRange): boolean {
  return a.top === b.top && a.left === b.left && a.bottom === b.bottom && a.right === b.right;
}

/** The distinct cells that have a position inside the rectangle, in reading order. */
export function rangeCells<T extends TableNode>(grid: TableGrid<T>, range: CellRange) {
  const seen = new Set<GridCell<T>>();
  for (let row = range.top; row <= range.bottom; row++)
    for (let column = range.left; column <= range.right; column++) {
      const cell = grid.at(row, column);
      if (cell) seen.add(cell);
    }
  return [...seen].sort((a, b) => a.row - b.row || a.column - b.column);
}

/** Rows at the top whose own cells are all headers; a header spanning further takes its rows. */
export function headerRows(grid: TableGrid): number {
  let count = 0;
  while (count < grid.rows) {
    const own = grid.cells.filter((cell) => cell.row === count);
    if (!own.length || own.some((cell) => cell.node.type !== "tableHeader")) break;
    count++;
  }
  for (const cell of grid.cells)
    if (cell.row < count) count = Math.max(count, cell.row + cell.rows);
  return count;
}

/** The cell that carries the resize handle of each column: the topmost one ending there. */
export function columnEdges(grid: TableGrid): Map<string, number> {
  const owners = new Map<string, number>();
  for (let column = 0; column < grid.columns; column++) {
    const cell = grid.cells.find((entry) => entry.column + entry.columns - 1 === column);
    if (cell && !owners.has(cell.node.id)) owners.set(cell.node.id, column);
  }
  return owners;
}
