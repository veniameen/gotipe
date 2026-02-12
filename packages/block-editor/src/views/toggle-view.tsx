import type { BlockView, GoTipeEditor } from "@gotipe/core";
import type React from "react";

export function ToggleView({
  block,
  editor,
  children,
}: { block: BlockView; editor: GoTipeEditor; children?: React.ReactNode }) {
  const isOpen = !!block.attrs.open;

  return (
    <details
      data-block-id={block.id}
      data-block-type="toggle"
      className="gotipe-toggle"
      open={isOpen}
      onToggle={(e) => {
        editor
          .chain()
          .setBlockAttrs(block.id, { open: (e.target as HTMLDetailsElement).open })
          .run();
      }}
    >
      <summary>Toggle</summary>
      <div className="gotipe-toggle-content">{children}</div>
    </details>
  );
}
