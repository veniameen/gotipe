import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { type BlockViewProps, TableColumnResizeHandle } from "@gotipe/react";
import type React from "react";
import { TableColumnButton } from "../components/table-column-menu";

type Align = "left" | "right" | "center" | null;

/** The table, column and row of a cell, found in the editor's view state. */
function cellPosition(
  editor: GoTipeEditor,
  cellId: string,
): { table: BlockView; column: number; row: number } | null {
  const visit = (blocks: BlockView[]): { table: BlockView; column: number; row: number } | null => {
    for (const block of blocks) {
      if (block.type === "table") {
        for (let row = 0; row < block.children.length; row++) {
          const column = block.children[row]!.children.findIndex((cell) => cell.id === cellId);
          if (column !== -1) return { table: block, column, row };
        }
        continue;
      }
      const inner = visit(block.children);
      if (inner) return inner;
    }
    return null;
  };
  return visit(editor.getViewState().blocks);
}

/**
 * A table cell of the shared views (GoTipe Atlas, frame 9): it follows its column's alignment,
 * the first row carries the width handle, a header cell carries the column's menu.
 */
export function TableCellView({
  block,
  editor,
  rootProps,
  content,
  readOnly,
  phantom,
}: BlockViewProps) {
  const position = cellPosition(editor, block.id);
  const align = position
    ? ((position.table.attrs.align as Align[] | undefined)?.[position.column] ?? null)
    : null;
  const isHeader = block.type === "tableHeader";
  const Tag = isHeader ? "th" : "td";
  const editable = !readOnly && !phantom;
  return (
    <Tag
      {...(rootProps as React.HTMLAttributes<HTMLTableCellElement>)}
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
      {isHeader && editable && position ? (
        <TableColumnButton editor={editor} tableId={position.table.id} column={position.column} />
      ) : null}
    </Tag>
  );
}
