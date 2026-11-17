import { type CellPosition, type TableGrid, editTable, rangeCells } from "@gotipe/core";
import type { TableLayout, TableMergeGuard } from "@gotipe/react";

/** What the “Cells” group of a table menu can do from one cell (Atlas frame 29). */
export interface CellActions {
  /** Two or more cells are selected together, and the page can keep the merged table. */
  canMerge: boolean;
  /** Why merging is not offered here (the host's guard); null when it is. */
  mergeLoss: string | null;
  merge(): void;
  /** The merged cell a split takes apart: the menu's own cell, else the caret's. */
  splitAt: CellPosition | null;
  split(): void;
}

/** `guard`: the host's reason not to merge in this table (a Markdown page that would lose it). */
export function cellActions(
  layout: TableLayout | null,
  cellId: string,
  guard: TableMergeGuard | null = null,
): CellActions {
  const grid = layout?.grid as TableGrid | undefined;
  const range = layout?.range ?? null;
  const mergeLoss = layout && guard ? guard(layout) : null;
  const canMerge = !!grid && !!range && rangeCells(grid, range).length >= 2 && !mergeLoss;
  const merged = (id: string) => {
    const cell = grid?.find(id);
    return cell && (cell.rows > 1 || cell.columns > 1) ? cell : null;
  };
  const target =
    merged(cellId) ?? (layout ? merged(layout.editor.getViewState().selection.head.blockId) : null);
  const splitAt = target ? { row: target.row, column: target.column } : null;
  return {
    canMerge,
    mergeLoss,
    merge: () => {
      if (!layout || !range || !canMerge) return;
      editTable(layout.editor, layout.table.id, {
        type: "mergeCells",
        from: { row: range.top, column: range.left },
        to: { row: range.bottom, column: range.right },
      });
      layout.select(null);
    },
    splitAt,
    split: () => {
      if (!layout || !splitAt) return;
      editTable(layout.editor, layout.table.id, { type: "splitCell", ...splitAt });
      layout.select(null);
    },
  };
}
