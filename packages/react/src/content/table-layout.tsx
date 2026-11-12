import { type BlockView, type GoTipeEditor, GoTipeError, editTable } from "@gotipe/core";
import {
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useGoTipeI18n } from "../i18n-context";
import { usePhantom } from "./context";
import { ContentIcon } from "./icons";

interface TableLayout {
  table: BlockView;
  editor: GoTipeEditor;
  readOnly: boolean;
  widths: number[];
  /** The scrolling area, so a new column can be brought into view. */
  scroll: RefObject<HTMLDivElement | null>;
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
  const scroll = useRef<HTMLDivElement | null>(null);
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
    <Context.Provider value={{ table: block, editor, readOnly, widths, scroll, preview, report }}>
      {children}
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
        <col key={layout.table.children[0]?.children[column]?.id ?? column} style={{ width }} />
      ))}
    </colgroup>
  ) : null;
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
  const { editor, table, report, scroll } = layout;
  const apply = (type: "insertRow" | "insertColumn") => {
    try {
      editTable(editor, table.id, {
        type,
        index:
          type === "insertRow" ? table.children.length : (table.children[0]?.children.length ?? 0),
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

/** One keyboard/pointer handle per first-row cell; a drag commits one undo step. */
export function TableColumnResizeHandle({ cellId }: { cellId: string }) {
  const layout = useContext(Context);
  const i18n = useGoTipeI18n();
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
      aria-label={i18n.t("table.resizeColumn", { index: column + 1 })}
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
    >
      <span className="gotipe-tip" aria-hidden="true">
        {i18n.t("table.resizeHint")}
      </span>
    </button>
  );
}
