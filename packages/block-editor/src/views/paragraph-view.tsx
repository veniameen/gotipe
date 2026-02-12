import type { BlockView } from "@gotipe/core";
import type React from "react";

export function ParagraphView({
  block,
  children,
}: { block: BlockView; children?: React.ReactNode }) {
  return (
    <p data-block-id={block.id} data-block-type="paragraph">
      {children}
    </p>
  );
}
