import { GoTipeError } from "./error";
import type { Block } from "./types/block";
import type { GoTipeEditor } from "./types/editor";
import type { Step } from "./types/state";

type TableEditor = Pick<GoTipeEditor, "getJSON" | "dispatch" | "isEditable" | "isDestroyed">;
export type TableEdit =
  | { type: "insertRow" | "deleteRow" | "insertColumn" | "deleteColumn"; index: number }
  | { type: "resizeColumn"; index: number; width: number };

function find(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const nested = find(block.children, id);
    if (nested) return nested;
  }
}
function cell(header: boolean): Block {
  return {
    id: crypto.randomUUID(),
    type: header ? "tableHeader" : "tableCell",
    attrs: {},
    content: [],
    children: [],
  };
}

/** Table operations produce one validated transaction, including all rows of a column. */
export function editTable(editor: TableEditor, tableId: string, action: TableEdit): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const table = find(editor.getJSON().blocks, tableId);
  if (!table || table.type !== "table")
    throw new GoTipeError("VALIDATION_ERROR", "Table no longer exists");
  const rows = table.children;
  const columns = rows[0]?.children.length ?? 0;
  const rowAction = action.type === "insertRow" || action.type === "deleteRow";
  const count = rowAction ? rows.length : columns;
  const insert = action.type.startsWith("insert");
  if (
    !Number.isInteger(action.index) ||
    action.index < 0 ||
    action.index >= count + (insert ? 1 : 0)
  ) {
    throw new GoTipeError("VALIDATION_ERROR", "Table position is out of range");
  }
  if (
    rows.some((row) =>
      row.children.some(
        (item) => Number(item.attrs.colspan ?? 1) > 1 || Number(item.attrs.rowspan ?? 1) > 1,
      ),
    )
  ) {
    throw new GoTipeError("VALIDATION_ERROR", "Unmerge table cells before changing its structure");
  }
  const steps: Step[] = [];
  const widths = Array.from({ length: columns }, (_, index) => {
    const value = Array.isArray(table.attrs.colWidths) ? table.attrs.colWidths[index] : null;
    return typeof value === "number" && Number.isFinite(value) ? value : 160;
  });
  const align = Array.from({ length: columns }, (_, index) =>
    Array.isArray(table.attrs.align) ? (table.attrs.align[index] ?? null) : null,
  );
  switch (action.type) {
    case "insertRow":
      steps.push({
        type: "insertBlock",
        parentId: table.id,
        index: action.index,
        block: {
          id: crypto.randomUUID(),
          type: "tableRow",
          attrs: {},
          content: null,
          children: Array.from({ length: Math.max(1, columns) }, () => cell(false)),
        },
      });
      break;
    case "deleteRow":
      steps.push({
        type: "deleteBlock",
        blockId: rows.length === 1 ? table.id : rows[action.index]!.id,
      });
      break;
    case "insertColumn":
      for (const row of rows)
        steps.push({
          type: "insertBlock",
          parentId: row.id,
          index: action.index,
          block: cell(
            row.children.length > 0 && row.children.every((item) => item.type === "tableHeader"),
          ),
        });
      widths.splice(action.index, 0, 160);
      align.splice(action.index, 0, null);
      steps.push({ type: "setBlockAttrs", blockId: table.id, attrs: { colWidths: widths, align } });
      break;
    case "deleteColumn":
      if (columns === 1) steps.push({ type: "deleteBlock", blockId: table.id });
      else {
        for (const row of rows) {
          const target = row.children[action.index];
          if (!target)
            throw new GoTipeError(
              "VALIDATION_ERROR",
              "Table rows must have the same number of cells",
            );
          steps.push({ type: "deleteBlock", blockId: target.id });
        }
        widths.splice(action.index, 1);
        align.splice(action.index, 1);
        steps.push({
          type: "setBlockAttrs",
          blockId: table.id,
          attrs: { colWidths: widths, align },
        });
      }
      break;
    case "resizeColumn":
      if (!Number.isFinite(action.width))
        throw new GoTipeError("VALIDATION_ERROR", "Column width must be finite");
      widths[action.index] = Math.max(64, Math.min(1600, Math.round(action.width)));
      steps.push({ type: "setBlockAttrs", blockId: table.id, attrs: { colWidths: widths } });
  }
  return editor.dispatch({ steps });
}
