import { type BlockView, type GoTipeEditor, GoTipeError, editTable } from "@gotipe/core";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePhantom } from "./context";

interface TableLayout {
  table: BlockView;
  editor: GoTipeEditor;
  readOnly: boolean;
  widths: number[];
  preview(column: number, width: number | null): void;
  report(error: unknown): void;
}
const Context = createContext<TableLayout | null>(null);

export function TableLayoutProvider({
  block,
  editor,
  children,
}: { block: BlockView; editor: GoTipeEditor; children: ReactNode }) {
  const [draft, setDraft] = useState<{ column: number; width: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const widths = Array.from({ length: block.children[0]?.children.length ?? 0 }, (_, column) => {
    const value = Array.isArray(block.attrs.colWidths) ? block.attrs.colWidths[column] : null;
    return draft?.column === column ? draft.width : typeof value === "number" ? value : 160;
  });
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
  return (
    <Context.Provider value={{ table: block, editor, readOnly, widths, preview, report }}>
      {children}
      {error && (
        <p contentEditable={false} role="alert">
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
        <col key={layout.table.children[0]?.children[column]?.id ?? column} style={{ width }} />
      ))}
    </colgroup>
  ) : null;
}

export function TableToolbar() {
  const layout = useContext(Context);
  if (!layout || layout.readOnly) return null;
  const { editor, table, report } = layout;
  const apply = (type: "insertRow" | "insertColumn") => {
    try {
      editTable(editor, table.id, {
        type,
        index:
          type === "insertRow" ? table.children.length : (table.children[0]?.children.length ?? 0),
      });
    } catch (error) {
      report(error);
    }
  };
  return (
    <div className="gotipe-table-actions" contentEditable={false} data-gotipe-widget="">
      <button
        type="button"
        className="gotipe-table-add-row"
        aria-label="Add row"
        onClick={() => apply("insertRow")}
      >
        + Row
      </button>
      <button
        type="button"
        className="gotipe-table-add-col"
        aria-label="Add column"
        onClick={() => apply("insertColumn")}
      >
        + Column
      </button>
    </div>
  );
}

/** One keyboard/pointer handle per first-row cell; a drag commits one undo step. */
export function TableColumnResizeHandle({ cellId }: { cellId: string }) {
  const layout = useContext(Context);
  const column = layout?.table.children[0]?.children.findIndex((cell) => cell.id === cellId) ?? -1;
  const drag = useRef<{ x: number; width: number; next: number; pointerId: number } | null>(null);
  const [active, setActive] = useState(false);
  const latest = useRef(layout);
  latest.current = layout;
  const commit = useCallback(
    (width: number) => {
      const current = latest.current;
      if (!current || current.readOnly) return;
      try {
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
      aria-label={`Resize column ${column + 1}`}
      title="Drag or use Left and Right arrows to resize"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const width =
          event.currentTarget.parentElement?.getBoundingClientRect().width ??
          layout.widths[column] ??
          160;
        drag.current = { x: event.clientX, width, next: width, pointerId: event.pointerId };
        setActive(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          commit((layout.widths[column] ?? 160) + (event.key === "ArrowRight" ? 16 : -16));
        }
      }}
    />
  );
}
