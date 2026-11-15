import { type GoTipeEditor, GoTipeError } from "@gotipe/core";
import {
  FloatingPortal,
  TABLE_CELLS_KEY,
  useFloatingPosition,
  useGoTipeI18n,
  useTableLayout,
  useTableMergeGuard,
} from "@gotipe/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageIcon, type PageIconName } from "../page/icons";
import { cellActions } from "../table/cell-actions";
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
import { MenuKey, Tip } from "./formatting/tip";

const TYPES: { type: ColumnType; icon: PageIconName }[] = [
  { type: "text", icon: "text" },
  { type: "code", icon: "code" },
  { type: "number", icon: "hash" },
  { type: "boolean", icon: "check" },
];

/**
 * One row of a table menu. `checked` makes it a radio row; `danger` paints it red; `disabled`
 * says why it is unavailable — the row stays focusable and shows the reason as its tip.
 */
interface MenuRow {
  key: string;
  icon: PageIconName;
  label: string;
  run: () => void;
  checked?: boolean;
  danger?: boolean;
  disabled?: string;
  /** A key that does the same from the table, shown at the row's end. */
  binding?: string;
}
/** A group of rows under an optional label, separated from the one before. */
interface MenuGroup {
  key: string;
  label?: string;
  rows: MenuRow[];
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
  groups: () => MenuGroup[];
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
      // the document takes the keys back, so ⌘Z undoes what the menu did
      if (!editor.isDestroyed) editor.focus();
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
            {groups().map((group, index) => (
              <div
                key={group.key}
                className="gotipe-table-menu-group"
                role="group"
                aria-label={group.label}
              >
                {index > 0 ? <hr className="gotipe-context-menu-separator" /> : null}
                {group.label ? (
                  <div className="gotipe-column-menu-label" aria-hidden="true">
                    {group.label}
                  </div>
                ) : null}
                {group.rows.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    role={row.checked === undefined ? "menuitem" : "menuitemradio"}
                    aria-checked={row.checked}
                    aria-disabled={row.disabled ? true : undefined}
                    className={row.danger ? "destructive" : undefined}
                    onClick={() => (row.disabled ? undefined : run(row.run))}
                  >
                    <PageIcon name={row.icon} />
                    <span className="gotipe-menu-text">{row.label}</span>
                    <MenuKey binding={row.binding} />
                    {row.checked ? (
                      <span className="gotipe-menu-end" aria-hidden="true">
                        <PageIcon name="check" />
                      </span>
                    ) : null}
                    {row.disabled ? (
                      <>
                        <span className="gotipe-sr-only">{row.disabled}</span>
                        <Tip label={row.disabled} />
                      </>
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

/** The «Cells» group: merge the selected cells, split a merged one (Atlas frame 29). */
function useCellsGroup(cellId: string): () => MenuGroup {
  const i18n = useGoTipeI18n();
  const layout = useTableLayout();
  const guard = useTableMergeGuard();
  return () => {
    const actions = cellActions(layout, cellId, guard);
    return {
      key: "cells",
      label: i18n.t("table.cells"),
      rows: [
        {
          key: "merge",
          icon: "merge",
          label: i18n.t("table.mergeCells"),
          disabled: actions.canMerge ? undefined : (actions.mergeLoss ?? i18n.t("table.mergeHint")),
          binding: TABLE_CELLS_KEY,
          run: actions.merge,
        },
        {
          key: "split",
          icon: "split",
          label: i18n.t("table.splitCell"),
          disabled: actions.splitAt ? undefined : i18n.t("table.splitHint"),
          binding: TABLE_CELLS_KEY,
          run: actions.split,
        },
      ],
    };
  };
}

/**
 * The column's handle in its header cell: its type, the cells, a row or a column more, the column
 * away. A header over several columns has no single type; its delete takes all its columns.
 */
export function TableColumnButton({
  editor,
  tableId,
  cellId,
  column,
  columns = 1,
}: {
  editor: GoTipeEditor;
  tableId: string;
  cellId: string;
  column: number;
  columns?: number;
}) {
  const i18n = useGoTipeI18n();
  const cells = useCellsGroup(cellId);
  // The column stores ✓ and —; the interface's words are what earlier versions wrote there.
  const words = { yes: i18n.t("table.yes"), no: i18n.t("table.no") };
  return (
    <TableHandleMenu
      editor={editor}
      className="gotipe-column-handle"
      label={i18n.t(columns > 1 ? "table.menu" : "table.columnType")}
      marker="data-gotipe-column-menu"
      groups={() => {
        const table = findTable(editor, tableId);
        const current = table ? columnTypeOf(table, column, words.yes, words.no) : "text";
        const types: MenuGroup = {
          key: "types",
          label: i18n.t("table.columnType"),
          rows: TYPES.map(({ type, icon }) => ({
            key: type,
            icon,
            label: i18n.t(`table.type.${type}`),
            checked: current === type,
            run: () => setColumnType(editor, tableId, column, type, words),
          })),
        };
        return [
          ...(columns > 1 ? [] : [types]),
          cells(),
          {
            key: "add",
            rows: [
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
                run: () => addColumn(editor, tableId, column + columns - 1),
              },
            ],
          },
          {
            key: "delete",
            rows: [
              {
                key: "delete",
                icon: "trash",
                label: i18n.t(columns > 1 ? "table.deleteColumns" : "table.deleteColumn"),
                danger: true,
                run: () => deleteColumn(editor, tableId, column, columns),
              },
            ],
          },
        ];
      }}
    />
  );
}

/** The row's handle beside its first cell: a row above or below, the cells, the row away. */
export function TableRowButton({
  editor,
  tableId,
  cellId,
  row,
  rows = 1,
}: {
  editor: GoTipeEditor;
  tableId: string;
  cellId: string;
  row: number;
  /** Rows the handle's cell spans: a row below goes under all of them. */
  rows?: number;
}) {
  const i18n = useGoTipeI18n();
  const cells = useCellsGroup(cellId);
  return (
    <TableHandleMenu
      editor={editor}
      className="gotipe-row-handle"
      label={i18n.t("table.rowMenu")}
      marker="data-gotipe-row-menu"
      groups={() => [
        {
          key: "row",
          label: i18n.t("table.rowMenu"),
          rows: [
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
              run: () => insertRow(editor, tableId, row + rows),
            },
          ],
        },
        cells(),
        {
          key: "delete",
          rows: [
            {
              key: "delete",
              icon: "trash",
              label: i18n.t("table.deleteRow"),
              danger: true,
              run: () => deleteRow(editor, tableId, row),
            },
          ],
        },
      ]}
    />
  );
}
