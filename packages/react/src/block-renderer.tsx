import type { BlockView, GoTipeEditor } from "@gotipe/core";
import type React from "react";

export interface BlockRendererProps {
  block: BlockView;
  children: React.ReactNode;
  editor: GoTipeEditor;
}

export function BlockRenderer({ block, children, editor: _editor }: BlockRendererProps) {
  return (
    <div data-block-id={block.id} data-block-type={block.type}>
      {children}
    </div>
  );
}
