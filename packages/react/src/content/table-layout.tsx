import {
  type BlockView,
  type CellPosition,
  type CellRange,
  type GoTipeEditor,
  GoTipeError,
  type TableGrid,
  cellRange,
  columnEdges,
  editTable,
  rangeCells,
} from "@gotipe/core";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useGoTipeI18n } from "../i18n-context";
import { usePhantom } from "./context";
import { ContentIcon } from "./icons";

/** Cells selected together, from the cell where the selection began to the one it reached. */
export interface SelectedTableCells {
  anchor: CellPosition;
  head: CellPosition;
}
export interface TableLayout {
  table: BlockView;
  editor: GoTipeEditor;
  readOnly: boolean;
  /** The table laid out as HTML does: spans, and the cell over every position. */
  grid: TableGrid<BlockView>;
  /** The column each cell carries the width handle of: the topmost cell ending there. */
  edges: Map<string, number>;
  /**
   * Each column's width in px; null for a column without a stored width, which shares what the
   * stored columns leave of the text column (never narrower than `--gt-cell-min`).
   */
  widths: (number | null)[];
  /** The scrolling area, so a new column can be brought into view. */
  scroll: RefObject<HTMLDivElement | null>;
  /** Selected cells: the rectangle reaches over every merged cell it cuts. */
  selection: SelectedTableCells | null;
  range: CellRange | null;
  select(selection: SelectedTableCells | null): void;
  preview(column: number, width: number | null): void;
  report(error: unknown): void;
}
const Context = createContext<TableLayout | null>(null);

/**
 * A host's reason not to merge cells in a table, or null to allow it: a Markdown page refuses a
 * merge that its format could not keep. The menus show the reason; the merge key does nothing.
 */
export type TableMergeGuard = (layout: TableLayout) => string | null;
const GuardContext = createContext<TableMergeGuard | null>(null);
export const TableMergeGuardProvider = GuardContext.Provider;
export function useTableMergeGuard(): TableMergeGuard | null {
  return useContext(GuardContext);
}

/** The layout of the table around a cell, for its views and menus; null outside a table. */
export function useTableLayout(): TableLayout | null {
  return useContext(Context);
}

export function TableLayoutProvider({
  block,
  grid,
  editor,
  children,
}: { block: BlockView; grid: TableGrid<BlockView>; editor: GoTipeEditor; children: ReactNode }) {
  const [draft, setDraft] = useState<{ column: number; width: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, select] = useState<SelectedTableCells | null>(null);
  const scroll = useRef<HTMLDivElement | null>(null);
  const stored = block.attrs.colWidths;
  const widths = useMemo(
    () =>
      Array.from({ length: grid.columns }, (_, column) => {
        const value = Array.isArray(stored) ? stored[column] : null;
        if (draft?.column === column) return draft.width;
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      }),
    [grid.columns, stored, draft],
  );
  const edges = useMemo(() => columnEdges(grid as TableGrid), [grid]);
  // a structural change ends a selection of cells: its positions name other cells now
  const shape = grid.cells.map((cell) => `${cell.node.id}@${cell.row},${cell.column}`).join(" ");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the shape is the trigger
  useEffect(() => select(null), [shape]);
  const range = useMemo(
    () => (selection ? cellRange(grid as TableGrid, selection.anchor, selection.head) : null),
    [grid, selection],
  );
  const preview = useCallback(
    (column: number, width: number | null) => setDraft(width === null ? null : { column, width }),
    [],
  );
  const report = useCallback(
    (cause: unknown) => {
      const error =
        cause instanceof GoTipeError
          ? cause
          : new GoTipeError(
              "TRANSFORM_ERROR",
              cause instanceof Error ? cause.message : "Table operation failed",
            );
      setError(error.message);
      editor.reportError(error);
    },
    [editor],
  );
  const readOnly = usePhantom() || !editor.isEditable;
  // one value per change of the table, so cells and handles re-render only with it
  const value = useMemo(
    () => ({
      table: block,
      editor,
      readOnly,
      grid,
      edges,
      widths,
      scroll,
      selection,
      range,
      select,
      preview,
      report,
    }),
    [block, editor, readOnly, grid, edges, widths, selection, range, preview, report],
  );
  const selected = range ? rangeCells(grid as TableGrid, range).length : 0;
  const i18n = useGoTipeI18n();
  return (
    <Context.Provider value={value}>
      {children}
      {/* cells selected together, said once for screen readers */}
      <p className="gotipe-sr-only" contentEditable={false} aria-live="polite">
        {selected > 1 ? i18n.t("table.cellsSelected", { count: selected }) : ""}
      </p>
      {/* the editor's toast shows the error; this line is for screen readers only */}
      {error && (
        <p className="gotipe-sr-only" contentEditable={false} role="alert">
          {error}
        </p>
      )}
    </Context.Provider>
  );
}

export function TableColumns() {
  const layout = useContext(Context);
  return layout ? (
    <colgroup>
      {layout.widths.map((width, column) => (
        <col key={column} style={width === null ? undefined : { width }} />
      ))}
    </colgroup>
  ) : null;
}

/**
 * The table element. With a column that has no stored width it fills the text column: those
 * columns share what the stored ones leave, each at least `--gt-cell-min`, and past that the
 * table scrolls in its own box (`.gotipe-table-shared`, Atlas frame 9).
 */
export function TableElement({ children }: { children: ReactNode }) {
  const layout = useContext(Context);
  const widths = layout?.widths ?? [];
  const shared = widths.filter((width) => width === null).length;
  if (!shared) return <table className="gotipe-table">{children}</table>;
  const fixed = widths.reduce<number>((sum, width) => sum + (width ?? 0), 0);
  const style = { "--gt-table-fixed": `${fixed}px`, "--gt-table-shared": shared } as CSSProperties;
  return (
    <table className="gotipe-table gotipe-table-shared" style={style}>
      {children}
    </table>
  );
}


type HiddenSide = "left" | "right" | "both";

/**
 * The scrolling area of a table (Atlas frame 9). It marks the sides that hide columns, so the
 * theme fades them; sides are physical, so the fade is right in either text direction.
 */
export function TableScroll({ children }: { children: ReactNode }) {
  const layout = useContext(Context);
  const own = useRef<HTMLDivElement | null>(null);
  const ref = layout?.scroll ?? own;
  const [hidden, setHidden] = useState<HiddenSide | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const table = element.firstElementChild?.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const left = !!table && table.left < box.left - 1;
      const right = !!table && table.right > box.right + 1;
      setHidden(left && right ? "both" : left ? "left" : right ? "right" : null);
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [ref]);
  return (
    <div ref={ref} className="gotipe-table-scroll" data-more={hidden ?? undefined}>
      {children}
    </div>
  );
}

/**
 * The bars that add a column (right of the table) and a row (under it), Atlas frame 9. They sit
 * outside the scrolling area; pressing one keeps the caret where it was.
 */
export function TableToolbar() {
  const layout = useContext(Context);
  const i18n = useGoTipeI18n();
  if (!layout || layout.readOnly) return null;
  const { editor, table, report, scroll, grid } = layout;
  const apply = (type: "insertRow" | "insertColumn") => {
    try {
      editTable(editor, table.id, {
        type,
        index: type === "insertRow" ? grid.rows : grid.columns,
      });
    } catch (error) {
      report(error);
      return;
    }
    if (type !== "insertColumn") return;
    // a wide table shows the new column: scroll to its end once React has drawn it
    requestAnimationFrame(() => {
      const element = scroll.current;
      if (!element) return;
      const rtl = getComputedStyle(element).direction === "rtl";
      element.scrollTo({ left: rtl ? -element.scrollWidth : element.scrollWidth });
    });
  };
  const bar = (type: "insertRow" | "insertColumn") => {
    const label = i18n.t(type === "insertRow" ? "table.addRow" : "table.addColumn");
    return (
      <button
        type="button"
        className={`gotipe-table-add ${type === "insertRow" ? "gotipe-table-add-row" : "gotipe-table-add-col"}`}
        contentEditable={false}
        data-gotipe-widget=""
        aria-label={label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => apply(type)}
      >
        <ContentIcon name="plus" />
        <span className="gotipe-tip" aria-hidden="true">
          {label}
        </span>
      </button>
    );
  };
  return (
    <>
      {bar("insertRow")}
      {bar("insertColumn")}
    </>
  );
}

/**
 * One keyboard/pointer handle per column, in the topmost cell whose right edge is the column's:
 * a header over two columns hands the first column's handle to the cell under it. A drag commits
 * one undo step.
 */
export function TableColumnResizeHandle({ cellId }: { cellId: string }) {
  const layout = useContext(Context);
  const i18n = useGoTipeI18n();
  const column = layout?.edges.get(cellId) ?? -1;
  const drag = useRef<{ x: number; width: number; next: number; pointerId: number } | null>(null);
  const [active, setActive] = useState(false);
  const latest = useRef(layout);
  latest.current = layout;
  const commit = useCallback(
    (width: number) => {
      const current = latest.current;
      if (!current || current.readOnly) return;
      try {
        // the planner keeps the other shared columns shared (null)
        editTable(current.editor, current.table.id, { type: "resizeColumn", index: column, width });
      } catch (error) {
        current.report(error);
      }
      current.preview(column, null);
    },
    [column],
  );
  useEffect(() => {
    if (!active) return;
    const cancel = () => {
      drag.current = null;
      latest.current?.preview(column, null);
      setActive(false);
    };
    const move = (event: PointerEvent) => {
      if (!drag.current || event.pointerId !== drag.current.pointerId) return;
      drag.current.next = Math.max(
        64,
        Math.min(1600, drag.current.width + event.clientX - drag.current.x),
      );
      latest.current?.preview(column, drag.current.next);
    };
    const finish = (event: PointerEvent) => {
      if (!drag.current || event.pointerId !== drag.current.pointerId) return;
      const width = drag.current.next;
      cancel();
      commit(width);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [active, column, commit]);
  if (!layout || layout.readOnly || column < 0) return null;
  return (
    <button
      type="button"
      className={`gotipe-table-col-resize${active ? " active" : ""}`}
      contentEditable={false}
      data-gotipe-widget=""
      aria-label={i18n.t("table.resizeColumn", { index: column + 1 })}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        // the column as drawn: a merged cell is wider than the column it resizes
        const width = renderedWidth(event.currentTarget, column, layout.widths[column]);
        drag.current = { x: event.clientX, width, next: width, pointerId: event.pointerId };
        setActive(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          const width = layout.widths[column] ?? renderedWidth(event.currentTarget, column);
          commit(width + (event.key === "ArrowRight" ? 16 : -16));
        }
      }}
    >
      <span className="gotipe-tip" aria-hidden="true">
        {i18n.t("table.resizeHint")}
      </span>
    </button>
  );
}

/**
 * The width a resize starts from: the column as drawn, else its stored width, else its cell's (a
 * shared column has no stored width).
 */
function renderedWidth(handle: HTMLElement, column: number, stored?: number | null): number {
  const col = handle.closest("table")?.querySelectorAll("col")[column];
  return (
    col?.getBoundingClientRect().width ||
    stored ||
    handle.parentElement?.getBoundingClientRect().width ||
    160
  );
}
