import { type GoTipeEditor, GoTipeError } from "@gotipe/core";
import { FloatingPortal, useFloatingPosition, useGoTipeI18n } from "@gotipe/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageIcon, type PageIconName } from "../page/icons";
import {
  type ColumnType,
  addColumn,
  addRow,
  columnTypeOf,
  deleteColumn,
  findTable,
  setColumnType,
} from "../table/column-types";
import { Tip } from "./formatting/tip";

const TYPES: { type: ColumnType; icon: PageIconName }[] = [
  { type: "text", icon: "text" },
  { type: "code", icon: "code" },
  { type: "number", icon: "hash" },
  { type: "boolean", icon: "check" },
];

/**
 * The column handle of a header cell and its menu (GoTipe Atlas, frame 9): the column's type,
 * a row or a column more, the column away. Shared by BlockEditor and PageEditor.
 */
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
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchor = useCallback(() => {
    const cell = buttonRef.current?.closest("th, td");
    return (cell ?? buttonRef.current)?.getBoundingClientRect() ?? null;
  }, []);
  const position = useFloatingPosition({
    open,
    anchor,
    element: menuRef,
    placement: "bottom-start",
  });

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("mousedown", close, true);
    document.addEventListener("keydown", keys, true);
    return () => {
      document.removeEventListener("mousedown", close, true);
      document.removeEventListener("keydown", keys, true);
    };
  }, [open]);

  // the first choice takes the keys once the menu has its place
  useEffect(() => {
    if (open && position)
      menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [open, position]);

  const table = open ? findTable(editor, tableId) : null;
  const words = { yes: i18n.t("table.yes"), no: i18n.t("table.no") };
  const current = table ? columnTypeOf(table, column, words.yes, words.no) : "text";
  const run = (action: () => void) => {
    try {
      action();
      setError(null);
      setOpen(false);
    } catch (cause) {
      const failure =
        cause instanceof GoTipeError
          ? cause
          : new GoTipeError(
              "TRANSFORM_ERROR",
              cause instanceof Error ? cause.message : "Table operation failed",
            );
      setError(failure.message);
      editor.reportError(failure);
    }
  };
  const arrows = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  };
  const label = i18n.t("table.columnType");

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="gotipe-column-handle"
        contentEditable={false}
        data-gotipe-widget=""
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={() => setOpen((value) => !value)}
      >
        <PageIcon name="chevron" />
        <Tip label={label} />
      </button>
      {open ? (
        <FloatingPortal owner={editor.element}>
          <div
            ref={menuRef}
            className="gotipe-column-menu"
            role="menu"
            aria-label={label}
            data-gotipe-column-menu=""
            style={{ position: "fixed", ...position, visibility: position ? "visible" : "hidden" }}
            onMouseDown={(event) => event.preventDefault()}
            onKeyDown={arrows}
          >
            <div className="gotipe-column-menu-label" aria-hidden="true">
              {label}
            </div>
            {TYPES.map(({ type, icon }) => (
              <button
                key={type}
                type="button"
                role="menuitemradio"
                aria-checked={current === type}
                onClick={() => run(() => setColumnType(editor, tableId, column, type, words))}
              >
                <PageIcon name={icon} />
                <span className="gotipe-menu-text">{i18n.t(`table.type.${type}`)}</span>
                {current === type ? (
                  <span className="gotipe-menu-end" aria-hidden="true">
                    <PageIcon name="check" />
                  </span>
                ) : null}
              </button>
            ))}
            <div className="gotipe-context-menu-separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              onClick={() => run(() => addRow(editor, tableId))}
            >
              <PageIcon name="plus" />
              <span className="gotipe-menu-text">{i18n.t("table.addRow")}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => run(() => addColumn(editor, tableId, column))}
            >
              <PageIcon name="plus" />
              <span className="gotipe-menu-text">{i18n.t("table.addColumn")}</span>
            </button>
            <div className="gotipe-context-menu-separator" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="destructive"
              onClick={() => run(() => deleteColumn(editor, tableId, column))}
            >
              <PageIcon name="trash" />
              <span className="gotipe-menu-text">{i18n.t("table.deleteColumn")}</span>
            </button>
            {error ? (
              <p role="alert" className="gotipe-sr-only">
                {error}
              </p>
            ) : null}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
