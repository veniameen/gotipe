import type { BlockView } from "@gotipe/core";
import type React from "react";
import { PageIcon } from "../page/icons";

export function CalloutView({ block, children }: { block: BlockView; children?: React.ReactNode }) {
  const emoji = typeof block.attrs.emoji === "string" ? block.attrs.emoji : "";
  const variant = String(block.attrs.type || "info");
  return (
    <div
      data-block-id={block.id}
      data-block-type="callout"
      data-variant={variant}
      className="gotipe-callout"
      role="note"
    >
      {emoji ? (
        <span
          className="gotipe-callout-emoji"
          aria-hidden="true"
          contentEditable={false}
          data-gotipe-widget=""
        >
          {emoji}
        </span>
      ) : (
        <span
          className="gotipe-callout-icon"
          aria-hidden="true"
          contentEditable={false}
          data-gotipe-widget=""
        >
          <PageIcon name={variant === "warning" ? "warning" : "info"} />
        </span>
      )}
      <div className="gotipe-callout-content">{children}</div>
    </div>
  );
}
