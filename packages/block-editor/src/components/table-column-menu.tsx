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
  deleteRow,
  findTable,
  insertRow,
  setColumnType,
} from "../table/column-types";
import { Tip } from "./formatting/tip";

const TYPES: { type: ColumnType; icon: PageIconName }[] = [
  { type: "text", icon: "text" },
  { type: "code", icon: "code" },
  { type: "number", icon: "hash" },
  { type: "boolean", icon: "check" },
];

/** One row of a table menu. `checked` makes it a radio row; `danger` paints it red. */
interface MenuRow {
  key: string;
  icon: PageIconName;
  label: string;
  run: () => void;
  checked?: boolean;
  danger?: boolean;
}

/**
 * A handle of the table and its menu (GoTipe Atlas, frame 9): a chevron in a header cell for the
 * column, beside a row for the row. The menu stands on the shared overlay surface.
 */
function TableHandleMenu({
  editor,
  className,
  label,
  groups,
  marker,
}: {
  editor: GoTipeEditor;
  className: string;
  label: string;
  groups: () => MenuRow[][];
  marker: "data-gotipe-column-menu" | "data-gotipe-row-menu";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchor = useCallback(() => buttonRef.current?.getBoundingClientRect() ?? null, []);
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

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
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
            {...{ [marker]: "" }}
            style={{ position: "fixed", ...position, visibility: position ? "visible" : "hidden" }}
            onMouseDown={(event) => event.preventDefault()}
            onKeyDown={arrows}
          >
            <div className="gotipe-column-menu-label" aria-hidden="true">
              {label}
            </div>
            {groups().map((group, index) => (
              <div key={group[0]?.key ?? index} className="gotipe-table-menu-group" role="group">
                {index > 0 ? (
                  <div className="gotipe-context-menu-separator" role="separator" />
                ) : null}
                {group.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    role={row.checked === undefined ? "menuitem" : "menuitemradio"}
                    aria-checked={row.checked}
                    className={row.danger ? "destructive" : undefined}
                    onClick={() => run(row.run)}
                  >
                    <PageIcon name={row.icon} />
                    <span className="gotipe-menu-text">{row.label}</span>
                    {row.checked ? (
                      <span className="gotipe-menu-end" aria-hidden="true">
                        <PageIcon name="check" />
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ))}
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

/** The column's handle in its header cell: its type, a row or a column more, the column away. */
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
  const words = { yes: i18n.t("table.yes"), no: i18n.t("table.no") };
  return (
    <TableHandleMenu
      editor={editor}
      className="gotipe-column-handle"
      label={i18n.t("table.columnType")}
      marker="data-gotipe-column-menu"
      groups={() => {
        const table = findTable(editor, tableId);
        const current = table ? columnTypeOf(table, column, words.yes, words.no) : "text";
        return [
          TYPES.map(({ type, icon }) => ({
            key: type,
            icon,
            label: i18n.t(`table.type.${type}`),
            checked: current === type,
            run: () => setColumnType(editor, tableId, column, type, words),
          })),
          [
            {
              key: "row",
              icon: "plus",
              label: i18n.t("table.addRow"),
              run: () => addRow(editor, tableId),
            },
            {
              key: "column",
              icon: "plus",
              label: i18n.t("table.addColumn"),
              run: () => addColumn(editor, tableId, column),
            },
          ],
          [
            {
              key: "delete",
              icon: "trash",
              label: i18n.t("table.deleteColumn"),
              danger: true,
              run: () => deleteColumn(editor, tableId, column),
            },
          ],
        ];
      }}
    />
  );
}

/** The row's handle beside its first cell: a row above or below, the row away. */
export function TableRowButton({
  editor,
  tableId,
  row,
}: {
  editor: GoTipeEditor;
  tableId: string;
  row: number;
}) {
  const i18n = useGoTipeI18n();
  return (
    <TableHandleMenu
      editor={editor}
      className="gotipe-row-handle"
      label={i18n.t("table.rowMenu")}
      marker="data-gotipe-row-menu"
      groups={() => [
        [
          {
            key: "above",
            icon: "up",
            label: i18n.t("table.addRowAbove"),
            run: () => insertRow(editor, tableId, row),
          },
          {
            key: "below",
            icon: "down",
            label: i18n.t("table.addRowBelow"),
            run: () => insertRow(editor, tableId, row + 1),
          },
        ],
        [
          {
            key: "delete",
            icon: "trash",
            label: i18n.t("table.deleteRow"),
            danger: true,
            run: () => deleteRow(editor, tableId, row),
          },
        ],
      ]}
    />
  );
}
