import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { useGoTipeI18n } from "@gotipe/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageIcon } from "./icons";
import { usePageOverlay } from "./overlay";

/**
 * Column types are not stored: they are read from and written to Markdown
 * (ADR-0059). «Число» — right alignment `---:`; «Код» — every body cell in
 * backticks; «Да / нет» — cells «да»/«нет»; «Текст» — as is.
 */
export type ColumnType = "text" | "code" | "number" | "boolean";

type Align = "left" | "right" | "center" | null;

function cellText(cell: BlockView): string {
  return Array.isArray(cell.content) ? cell.content.map((s) => s.text).join("") : "";
}

function isFullyCode(cell: BlockView): boolean {
  return (
    Array.isArray(cell.content) &&
    cell.content.length > 0 &&
    cell.content.every((s) => s.text.length === 0 || s.marks.some((m) => m.type === "code"))
  );
}

function findTable(editor: GoTipeEditor, tableId: string): BlockView | null {
  const visit = (blocks: BlockView[]): BlockView | null => {
    for (const b of blocks) {
      if (b.id === tableId) return b;
      const inner = visit(b.children);
      if (inner) return inner;
    }
    return null;
  };
  return visit(editor.getViewState().blocks);
}

function bodyCells(table: BlockView, column: number): BlockView[] {
  return table.children
    .slice(table.children[0]?.children.some((c) => c.type === "tableHeader") ? 1 : 0)
    .map((row) => row.children[column])
    .filter((c): c is BlockView => !!c);
}

export function columnTypeOf(table: BlockView, column: number, yes: string, no: string): ColumnType {
  const align = (table.attrs.align as Align[] | undefined)?.[column] ?? null;
  const cells = bodyCells(table, column).filter((c) => cellText(c).length > 0);
  if (cells.length > 0 && cells.every(isFullyCode)) return "code";
  if (align === "right") return "number";
  const values = new Set([yes, no]);
  if (cells.length > 0 && cells.every((c) => values.has(cellText(c).trim().toLowerCase()))) return "boolean";
  return "text";
}

const TRUTHY = /^(да|yes|true|1|\+|x|✓|✔|y)$/i;
const FALSY = /^(нет|no|false|0|-|—|n|)$/i;

export function setColumnType(
  editor: GoTipeEditor,
  tableId: string,
  column: number,
  type: ColumnType,
  words: { yes: string; no: string },
): void {
  const table = findTable(editor, tableId);
  if (!table) return;
  const steps: Record<string, unknown>[] = [];
  const align = [...((table.attrs.align as Align[] | undefined) ?? [])];
  const width = Math.max(align.length, ...table.children.map((r) => r.children.length));
  while (align.length < width) align.push(null);
  align[column] = type === "number" ? "right" : align[column] === "right" ? null : align[column] ?? null;
  steps.push({ type: "setBlockAttrs", blockId: table.id, attrs: { align } });
  for (const cell of bodyCells(table, column)) {
    const text = cellText(cell);
    if (type === "code") {
      if (text.length > 0 && !isFullyCode(cell)) {
        steps.push({ type: "addMark", blockId: cell.id, from: 0, to: text.length, mark: { type: "code", attrs: {} } });
      }
    } else if (isFullyCode(cell) && text.length > 0) {
      steps.push({ type: "removeMark", blockId: cell.id, from: 0, to: text.length, markType: "code" });
    }
    if (type === "boolean") {
      const value = text.trim();
      const next = TRUTHY.test(value) ? words.yes : FALSY.test(value) ? words.no : null;
      if (next !== null && next !== text) {
        if (text.length > 0) steps.push({ type: "deleteText", blockId: cell.id, from: 0, to: text.length });
        steps.push({ type: "insertText", blockId: cell.id, offset: 0, text: next, marks: [] });
      }
    }
  }
  editor.dispatch({ steps });
}

function emptyCell(type: "tableCell" | "tableHeader"): Record<string, unknown> {
  return { id: crypto.randomUUID(), type, attrs: {}, content: [], children: [] };
}

export function addRow(editor: GoTipeEditor, tableId: string): void {
  const table = findTable(editor, tableId);
  if (!table) return;
  const width = Math.max(1, ...table.children.map((r) => r.children.length));
  editor.dispatch({
    steps: [
      {
        type: "insertBlock",
        parentId: table.id,
        index: table.children.length,
        block: {
          id: crypto.randomUUID(),
          type: "tableRow",
          attrs: {},
          content: null,
          children: Array.from({ length: width }, () => emptyCell("tableCell")),
        },
      },
    ],
  });
}

export function addColumn(editor: GoTipeEditor, tableId: string, after: number): void {
  const table = findTable(editor, tableId);
  if (!table) return;
  const steps: Record<string, unknown>[] = [];
  table.children.forEach((row, r) => {
    const headerRow = r === 0 && row.children.some((c) => c.type === "tableHeader");
    steps.push({
      type: "insertBlock",
      parentId: row.id,
      index: Math.min(after + 1, row.children.length),
      block: emptyCell(headerRow ? "tableHeader" : "tableCell"),
    });
  });
  const align = [...((table.attrs.align as Align[] | undefined) ?? [])];
  if (align.length > after) align.splice(after + 1, 0, null);
  steps.push({ type: "setBlockAttrs", blockId: table.id, attrs: { align } });
  editor.dispatch({ steps });
}

export function deleteColumn(editor: GoTipeEditor, tableId: string, column: number): void {
  const table = findTable(editor, tableId);
  if (!table) return;
  const width = Math.max(...table.children.map((r) => r.children.length));
  if (width <= 1) {
    editor.dispatch({ steps: [{ type: "deleteBlock", blockId: table.id }] });
    return;
  }
  const steps: Record<string, unknown>[] = [];
  for (const row of table.children) {
    const cell = row.children[column];
    if (cell) steps.push({ type: "deleteBlock", blockId: cell.id });
  }
  const align = [...((table.attrs.align as Align[] | undefined) ?? [])];
  if (align.length > column) align.splice(column, 1);
  steps.push({ type: "setBlockAttrs", blockId: table.id, attrs: { align } });
  editor.dispatch({ steps });
}

export function TableColumnButton({
  editor,
  tableId,
  column,
}: {
  editor: GoTipeEditor;
  tableId: string;
  column: number;
}) {
  const i18n = useGoTipeI18n();
  const overlay = usePageOverlay();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const cell = buttonRef.current?.closest("th, td");
    const rect = (cell ?? buttonRef.current)?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const table = open ? findTable(editor, tableId) : null;
  const words = { yes: i18n.t("table.yes"), no: i18n.t("table.no") };
  const current = table ? columnTypeOf(table, column, words.yes, words.no) : "text";
  const types: { type: ColumnType; label: string; glyph: React.ReactNode }[] = [
    { type: "text", label: i18n.t("table.type.text"), glyph: <PageIcon name="text" /> },
    { type: "code", label: i18n.t("table.type.code"), glyph: <PageIcon name="code" /> },
    { type: "number", label: i18n.t("table.type.number"), glyph: <PageIcon name="hash" /> },
    { type: "boolean", label: i18n.t("table.type.boolean"), glyph: <PageIcon name="check" /> },
  ];
  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="gotipe-col-btn"
        contentEditable={false}
        data-gotipe-widget=""
        aria-label={i18n.t("table.columnType")}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <PageIcon name="chevron" />
      </button>
      {open && pos && overlay
        ? createPortal(
            <div
              ref={menuRef}
              className="gotipe-page-menu gotipe-col-menu"
              role="menu"
              aria-label={i18n.t("table.columnType")}
              style={{ position: "fixed", top: pos.top, left: pos.left }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="gotipe-page-menu-head">{i18n.t("table.columnType")}</div>
              {types.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current === t.type}
                  className="gotipe-page-menu-item"
                  onClick={() => run(() => setColumnType(editor, tableId, column, t.type, words))}
                >
                  <span className="gotipe-page-menu-icon">{t.glyph}</span>
                  <span className="gotipe-page-menu-label">{t.label}</span>
                  {current === t.type ? (
                    <span className="gotipe-page-menu-meta">
                      <PageIcon name="check" />
                    </span>
                  ) : null}
                </button>
              ))}
              <div className="gotipe-page-menu-sep" role="separator" />
              <button type="button" role="menuitem" className="gotipe-page-menu-item" onClick={() => run(() => addRow(editor, tableId))}>
                <span className="gotipe-page-menu-icon">
                  <PageIcon name="down" />
                </span>
                <span className="gotipe-page-menu-label">{i18n.t("table.addRow")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="gotipe-page-menu-item"
                onClick={() => run(() => addColumn(editor, tableId, column))}
              >
                <span className="gotipe-page-menu-icon">
                  <PageIcon name="table" />
                </span>
                <span className="gotipe-page-menu-label">{i18n.t("table.addColumn")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="gotipe-page-menu-item is-danger"
                onClick={() => run(() => deleteColumn(editor, tableId, column))}
              >
                <span className="gotipe-page-menu-icon">
                  <PageIcon name="trash" />
                </span>
                <span className="gotipe-page-menu-label">{i18n.t("table.deleteColumn")}</span>
              </button>
            </div>,
            overlay,
          )
        : null}
    </>
  );
}
