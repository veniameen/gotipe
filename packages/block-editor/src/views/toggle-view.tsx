import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { TextRenderer, ToggleBlock } from "@gotipe/react";
import type React from "react";

export function ToggleView({
  block,
  editor,
  children,
}: { block: BlockView; editor: GoTipeEditor; children?: React.ReactNode }) {
  return (
    <ToggleBlock
      block={block}
      editor={editor}
      rootProps={{ "data-block-id": block.id }}
      content={
        Array.isArray(block.content) ? (
          <TextRenderer spans={block.content} decorations={block.decorations} />
        ) : (
          block.content
        )
      }
    >
      {children}
    </ToggleBlock>
  );
}
