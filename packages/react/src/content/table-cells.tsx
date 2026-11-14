import {
  type BlockView,
  type CellPosition,
  type GoTipeEditor,
  type TableGrid,
  editTable,
  rangeCells,
} from "@gotipe/core";
import type React from "react";
import { type ReactNode, useEffect, useRef } from "react";
import {
  TableColumnResizeHandle,
  type TableLayout,
  useTableLayout,
  useTableMergeGuard,
} from "./table-layout";

/**
 * The span and selection of a cell (Atlas frame 29): a merged cell takes its columns and rows,
 * cells selected together are tinted with the selection's colour.
 */
export function useTableCell(cellId: string): {
  colSpan?: number;
  rowSpan?: number;
  selected: boolean;
  /** The cell reaches the last row, so it draws no rule under itself. */
  lastRow: boolean;
} {
  const layout = useTableLayout();
  const cell = layout?.grid.find(cellId);
  const range = layout?.range;
  const selected =
    !!cell &&
    !!range &&
    cell.row >= range.top &&
    cell.row <= range.bottom &&
    cell.column >= range.left &&
    cell.column <= range.right;
  return {
    colSpan: cell && cell.columns > 1 ? cell.columns : undefined,
    rowSpan: cell && cell.rows > 1 ? cell.rows : undefined,
    selected,
    lastRow: !!cell && !!layout && cell.row + cell.rows === layout.grid.rows,
  };
}

/** A row whose first own cell is not in the first column: the cell restores its inner padding. */
export function TableRow({
  block,
  rootProps,
  children,
}: { block: BlockView; rootProps: Record<string, unknown>; children: ReactNode }) {
  const layout = useTableLayout();
  const first = block.children[0] ? layout?.grid.find(block.children[0].id) : null;
  const className = [rootProps.className, first && first.column > 0 ? "is-continued" : null]
    .filter(Boolean)
    .join(" ");
  return (
    <tr {...rootProps} className={className || undefined} data-block-type={block.type}>
      {children}
    </tr>
  );
}

/** A header or body cell of the MIT renderer, with its spans, selection and resize handle. */
export function TableCell({
  block,
  rootProps,
  readOnly,
  children,
}: {
  block: BlockView;
  rootProps: Record<string, unknown>;
  readOnly: boolean;
  children: ReactNode;
}) {
  const { colSpan, rowSpan, selected, lastRow } = useTableCell(block.id);
  const Tag = block.type === "tableHeader" ? "th" : "td";
  const className = [rootProps.className, selected ? "gotipe-table-cell-selected" : null]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag
      {...(rootProps as React.HTMLAttributes<HTMLTableCellElement>)}
      className={className || undefined}
      colSpan={colSpan}
      rowSpan={rowSpan}
      aria-selected={selected || undefined}
      data-last-row={lastRow && rowSpan ? "" : undefined}
      data-block-type={block.type}
      contentEditable={!readOnly}
      suppressContentEditableWarning
    >
      {children}
      <TableColumnResizeHandle cellId={block.id} />
    </Tag>
  );
}

const STEPS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};
const CELL = '[data-block-type="tableCell"], [data-block-type="tableHeader"]';

/** The key that merges selected cells or splits a merged one: ⌘⇧M, Ctrl+Shift+M elsewhere. */
export const TABLE_CELLS_KEY = "Mod-Shift-m";
function isCellsKey(event: KeyboardEvent): boolean {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return (
    event.code === "KeyM" &&
    event.shiftKey &&
    !event.altKey &&
    (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
  );
}

/** The grid position one step from a cell's edge, inside the table. */
function beyond(grid: TableGrid, from: CellPosition, key: string): CellPosition | null {
  const [down, right] = STEPS[key]!;
  const cell = grid.at(from.row, from.column);
  if (!cell) return null;
  const row = down > 0 ? cell.row + cell.rows : down < 0 ? cell.row - 1 : from.row;
  const column = right > 0 ? cell.column + cell.columns : right < 0 ? cell.column - 1 : from.column;
  return row < 0 || column < 0 || row >= grid.rows || column >= grid.columns
    ? null
    : { row, column };
}
function textLength(cell: BlockView): number {
  return Array.isArray(cell.content)
    ? cell.content.reduce((sum, span) => sum + span.text.length, 0)
    : 0;
}
/** The caret's cell when it stands at the cell's edge in the direction of the key. */
function caretAtEdge(editor: GoTipeEditor, grid: TableGrid<BlockView>, key: string) {
  const selection = editor.getDOMSelection() ?? editor.getViewState().selection;
  const { anchor, head } = selection;
  if (anchor.blockId !== head.blockId) return null;
  const cell = grid.find(head.blockId);
  if (!cell) return null;
  const forward = key === "ArrowRight" || key === "ArrowDown";
  return head.offset === (forward ? textLength(cell.node) : 0) ? cell : null;
}

/**
 * Selecting cells together: a drag across cells, Shift+click and Shift+arrows from a cell's edge.
 * Escape or a plain click ends it; Delete empties the selected cells in one step. Listeners sit
 * on the scrolling area, so they run before the editor's own keys.
 */
export function useTableCellSelection(current: TableLayout | null): void {
  const guard = useTableMergeGuard();
  const latest = useRef(current);
  latest.current = current;
  const latestGuard = useRef(guard);
  latestGuard.current = guard;
  const scroll = current?.scroll;
  const readOnly = current?.readOnly ?? true;
  useEffect(() => {
    const element = scroll?.current;
    if (!element || readOnly) return;
    const live = () => latest.current!;
    const position = (target: EventTarget | null): CellPosition | null => {
      const { grid } = live();
      const node = target instanceof Element ? target.closest<HTMLElement>(CELL) : null;
      if (!node || !element.contains(node) || node.closest("[data-gotipe-widget]")) return null;
      const cell = grid.find(node.dataset.blockId ?? "");
      return cell ? { row: cell.row, column: cell.column } : null;
    };
    let drag: CellPosition | null = null;
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-gotipe-widget]")) return;
      const at = position(event.target);
      if (!at) return;
      const layout = live();
      if (event.shiftKey) {
        const caret = layout.grid.find(layout.editor.getViewState().selection.head.blockId);
        const anchor =
          layout.selection?.anchor ?? (caret ? { row: caret.row, column: caret.column } : null);
        if (!anchor) return;
        event.preventDefault();
        layout.select({ anchor, head: at });
        return;
      }
      drag = at;
      if (layout.selection) layout.select(null);
    };
    const move = (event: PointerEvent) => {
      if (!drag || !(event.buttons & 1)) return;
      const at = position(document.elementFromPoint(event.clientX, event.clientY));
      if (!at) return;
      const layout = live();
      if (at.row === drag.row && at.column === drag.column && !layout.selection) return;
      element.setAttribute("data-cell-drag", "");
      unselectText();
      layout.select({ anchor: drag, head: at });
    };
    // the cells are the selection: text the drag selected in the first cell goes
    const unselectText = () => {
      const text = element.ownerDocument.getSelection();
      if (text && !text.isCollapsed) text.collapseToStart();
    };
    const up = () => {
      drag = null;
      if (!element.hasAttribute("data-cell-drag")) return;
      element.removeAttribute("data-cell-drag");
      unselectText();
    };
    const key = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const layout = live();
      const { grid, editor, select } = layout;
      const active = layout.range;
      if (event.key === "Escape" && active) {
        event.preventDefault();
        event.stopPropagation();
        select(null);
        return;
      }
      if (isCellsKey(event)) {
        // merge the selected cells, or split the merged cell under the selection or the caret
        const cells = active ? rangeCells(grid as TableGrid, active) : [];
        const caret = grid.find(editor.getViewState().selection.head.blockId);
        const merged = cells.length === 1 ? cells[0] : cells.length ? null : caret;
        try {
          if (active && cells.length > 1) {
            if (latestGuard.current?.(layout)) return;
            editTable(editor, layout.table.id, {
              type: "mergeCells",
              from: { row: active.top, column: active.left },
              to: { row: active.bottom, column: active.right },
            });
          } else if (merged && (merged.rows > 1 || merged.columns > 1))
            editTable(editor, layout.table.id, {
              type: "splitCell",
              row: merged.row,
              column: merged.column,
            });
          else return;
        } catch (error) {
          layout.report(error);
        }
        event.preventDefault();
        event.stopPropagation();
        select(null);
        return;
      }
      if (active && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        event.stopPropagation();
        const steps = rangeCells(grid, active).flatMap((cell) => {
          const length = textLength(cell.node);
          return length ? [{ type: "deleteText", blockId: cell.node.id, from: 0, to: length }] : [];
        });
        if (steps.length) editor.dispatch({ steps });
        return;
      }
      if (event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && STEPS[event.key]) {
        const from = layout.selection?.head;
        const edge = from ? null : caretAtEdge(editor, grid, event.key);
        const start = from ?? (edge ? { row: edge.row, column: edge.column } : null);
        const next = start && beyond(grid as TableGrid, start, event.key);
        if (!start || !next) return;
        event.preventDefault();
        event.stopPropagation();
        select({ anchor: layout.selection?.anchor ?? start, head: next });
        return;
      }
      // Tab keeps the selection: the keys may be on their way to a menu
      if (active && !["Shift", "Alt", "Control", "Meta", "Tab"].includes(event.key)) select(null);
    };
    element.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    element.addEventListener("keydown", key);
    return () => {
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      element.removeEventListener("keydown", key);
    };
  }, [scroll, readOnly]);
}

/** Installs the cell selection on the table it is rendered in. */
export function TableCellSelection() {
  useTableCellSelection(useTableLayout());
  return null;
}
