import {
  type BlockViewProps,
  TableColumnResizeHandle,
  useTableCell,
  useTableLayout,
} from "@gotipe/react";
import type React from "react";
import { TableColumnButton, TableRowButton } from "../components/table-column-menu";

type Align = "left" | "right" | "center" | null;

/**
 * A table cell of the shared views (GoTipe Atlas, frames 9 and 29): it follows its column's
 * alignment, takes the columns and rows it is merged over, is tinted while selected with other
 * cells; the cell ending a column carries the width handle, a header cell carries the menu of its
 * columns and the first cell of a body row carries the row's.
 */
export function TableCellView({
  block,
  editor,
  rootProps,
  content,
  readOnly,
  phantom,
}: BlockViewProps) {
  const layout = useTableLayout();
  const position = layout?.grid.find(block.id) ?? null;
  const { colSpan, rowSpan, selected, lastRow } = useTableCell(block.id);
  const align = position
    ? ((layout?.table.attrs.align as Align[] | undefined)?.[position.column] ?? null)
    : null;
  const isHeader = block.type === "tableHeader";
  const Tag = isHeader ? "th" : "td";
  const editable = !readOnly && !phantom;
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
      contentEditable={editable}
      suppressContentEditableWarning
      style={{
        ...((rootProps.style as React.CSSProperties | undefined) ?? {}),
        textAlign: align ?? undefined,
      }}
      data-align={align ?? undefined}
    >
      {content}
      {editable && <TableColumnResizeHandle cellId={block.id} />}
      {isHeader && editable && layout && position ? (
        <TableColumnButton
          editor={editor}
          tableId={layout.table.id}
          cellId={block.id}
          column={position.column}
          columns={position.columns}
        />
      ) : null}
      {!isHeader && editable && layout && position?.column === 0 ? (
        <TableRowButton
          editor={editor}
          tableId={layout.table.id}
          cellId={block.id}
          row={position.row}
          rows={position.rows}
        />
      ) : null}
    </Tag>
  );
}

// The cell draws from its block, the table's layout context and its own menus' state.
TableCellView.pure = true;
