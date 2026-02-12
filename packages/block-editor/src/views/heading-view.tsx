import type { BlockView } from "@gotipe/core";
import type React from "react";

export function HeadingView({ block, children }: { block: BlockView; children?: React.ReactNode }) {
  const level = (block.attrs.level as number) || 1;
  const Tag = `h${Math.min(Math.max(level, 1), 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  return (
    <Tag data-block-id={block.id} data-block-type="heading" aria-level={level}>
      {children}
    </Tag>
  );
}
