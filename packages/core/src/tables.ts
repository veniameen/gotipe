import { GoTipeError } from "./error";
import { type CellPosition, tableGrid } from "./table/grid";
import {
  type PlannedTable,
  checkPlan,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  mergeCells,
  planTable,
  planned,
  splitCell,
} from "./table/layout";
import { tableSteps } from "./table/steps";
import type { Block } from "./types/block";
import type { GoTipeEditor } from "./types/editor";

type TableEditor = Pick<
  GoTipeEditor,
  "getJSON" | "dispatch" | "previewTransaction" | "isEditable" | "isDestroyed"
>;
export type TableEdit =
  | { type: "insertRow" | "insertColumn"; index: number }
  /** `count` rows or columns from `index`, as one step; all of them take the table away. */
  | { type: "deleteRow" | "deleteColumn"; index: number; count?: number }
  | { type: "resizeColumn"; index: number; width: number }
  /** One cell over the rectangle between two grid positions; it must not cut a merged cell. */
  | { type: "mergeCells"; from: CellPosition; to: CellPosition }
  /** The merged cell over this grid position back to one cell per position. */
  | { type: "splitCell"; row: number; column: number };

function find(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const nested = find(block.children, id);
    if (nested) return nested;
  }
}
const fail = (message: string): never => {
  throw new GoTipeError("VALIDATION_ERROR", message);
};
function checkPosition(position: { row: number; column: number } | undefined): void {
  if (!position || !Number.isInteger(position.row) || !Number.isInteger(position.column))
    fail("Table position is out of range");
  if (position!.row < 0 || position!.column < 0) fail("Table position is out of range");
}
function checkIndex(index: number, count: number, limit: number): void {
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1)
    fail("Table position is out of range");
  if (index < 0 || index + count > limit) fail("Table position is out of range");
}

/** Plans the edit on a copy of the table's grid; nothing is written yet. */
function plan(table: Block, action: TableEdit): { plan: PlannedTable; focus?: string } {
  // a stored table that needs repair (a span past the last row, overlapping cells) is read as
  // drawn; the edit writes the repaired spans
  const grid = tableGrid(table);
  const result = planTable(table, action.type !== "resizeColumn");
  switch (action.type) {
    case "insertRow":
      checkIndex(action.index, 1, grid.rows + 1);
      insertRow(result, action.index);
      break;
    case "insertColumn":
      checkIndex(action.index, 1, grid.columns + 1);
      insertColumn(result, action.index);
      break;
    case "deleteRow":
    case "deleteColumn": {
      const count = action.count ?? 1;
      const rows = action.type === "deleteRow";
      checkIndex(action.index, count, rows ? grid.rows : grid.columns);
      for (let step = 0; step < count && !result.removed; step++)
        (rows ? deleteRow : deleteColumn)(result, action.index);
      break;
    }
    case "resizeColumn":
      checkIndex(action.index, 1, grid.columns);
      if (!Number.isFinite(action.width)) fail("Column width must be finite");
      result.widths[action.index] = Math.max(64, Math.min(1600, Math.round(action.width)));
      break;
    case "mergeCells":
      checkPosition(action.from);
      checkPosition(action.to);
      return { plan: result, focus: mergeCells(result, action.from, action.to).block.id };
    case "splitCell":
      checkPosition(action);
      splitCell(result, { row: action.row, column: action.column });
      break;
    default:
      fail("Unknown table edit");
  }
  return { plan: result };
}

/**
 * Table operations produce one validated transaction and one undo step, including all rows of a
 * column and every cell a span covers. The planned table is checked before anything is written:
 * cells may neither overlap nor leave a position empty, and a merged cell never reaches past the
 * table. The staged result is compared with the plan, so both engines write the same table.
 */
export function editTable(editor: TableEditor, tableId: string, action: TableEdit): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const table = find(editor.getJSON().blocks, tableId);
  if (!table || table.type !== "table")
    throw new GoTipeError("VALIDATION_ERROR", "Table no longer exists");
  const { plan: result, focus } = plan(table, action);
  checkPlan(result, action.type !== "resizeColumn");
  const steps = tableSteps(table, result);
  if (!steps.length) return true;
  if (result.removed) return editor.dispatch({ steps });
  const staged = find(editor.previewTransaction({ steps }).blocks, tableId);
  const expected = planned(result).children.map((row) => row.children.map((cell) => cell.id));
  const written = staged?.children.map((row) => row.children.map((cell) => cell.id));
  if (!staged || tableGrid(staged).problem || JSON.stringify(written) !== JSON.stringify(expected))
    throw new GoTipeError("TRANSFORM_ERROR", "The table edit did not produce the planned table");
  // the caret goes to the end of a merged cell
  const merged = focus ? tableGrid(staged).find(focus)?.node : undefined;
  if (!merged) return editor.dispatch({ steps });
  const offset = Array.isArray(merged.content)
    ? merged.content.reduce((sum, span) => sum + span.text.length, 0)
    : 0;
  return editor.dispatch({ steps, selection: { type: "cursor", blockId: merged.id, offset } });
}
