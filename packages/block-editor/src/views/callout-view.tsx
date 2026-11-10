import type { BlockView } from "@gotipe/core";
import type React from "react";

export function CalloutView({ block, children }: { block: BlockView; children?: React.ReactNode }) {
  const emoji = (block.attrs.emoji as string) || "💡";
  return (
    <div
      data-block-id={block.id}
      data-block-type="callout"
      data-variant={String(block.attrs.type || "info")}
      className="gotipe-callout"
      role="note"
    >
      <span
        className="gotipe-callout-emoji"
        aria-hidden="true"
        contentEditable={false}
        data-gotipe-widget=""
      >
        {emoji}
      </span>
      <div className="gotipe-callout-content">{children}</div>
    </div>
  );
}
