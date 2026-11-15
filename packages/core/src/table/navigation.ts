/**
 * Tab and Shift-Tab in a table: the cell after or before the current one in reading order — row
 * by row, each row from its first cell. Navigation stays in the table that holds the cell, its
 * nearest `table` ancestor; at the table's first or last cell there is no target, so the command
 * reports that it did nothing and the key keeps its default meaning.
 */

/** The part of a block or block view the navigation reads. */
interface TreeNode<T> {
  id: string;
  type: string;
  children: T[];
}

const isCell = (node: { type: string }) => node.type === "tableCell" || node.type === "tableHeader";

/** The nearest `table` ancestor of the block: null outside a table, undefined if not found. */
function enclosingTable<T extends TreeNode<T>>(
  nodes: readonly T[],
  id: string,
  table: T | null,
): T | null | undefined {
  for (const node of nodes) {
    if (node.id === id) return table;
    const found = enclosingTable(node.children, id, node.type === "table" ? node : table);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The table's own cells in reading order; a table inside a cell keeps its cells to itself. */
function cellsOf<T extends TreeNode<T>>(table: T): T[] {
  const cells: T[] = [];
  const collect = (nodes: readonly T[]) => {
    for (const node of nodes) {
      if (isCell(node)) cells.push(node);
      if (node.type !== "table") collect(node.children);
    }
  };
  collect(table.children);
  return cells;
}

/** The neighbouring cell in the same table, or null at its edge and outside a table. */
export function adjacentCell<T extends TreeNode<T>>(
  blocks: readonly T[],
  cellId: string,
  direction: "next" | "prev",
): T | null {
  const table = enclosingTable(blocks, cellId, null);
  if (!table) return null;
  const cells = cellsOf(table);
  const index = cells.findIndex((cell) => cell.id === cellId);
  if (index === -1) return null;
  return cells[direction === "next" ? index + 1 : index - 1] ?? null;
}
