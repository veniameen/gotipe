import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { TableBlock } from "@gotipe/react";
import type { ReactNode } from "react";

/** Uses the same editor-owned cells, operations and resize lifecycle as EditorContent. */
export function TableView({
  block,
  editor,
}: { block: BlockView; editor: GoTipeEditor; children?: ReactNode }) {
  return <TableBlock block={block} editor={editor} />;
}
