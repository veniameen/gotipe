import type { BlockView } from "@gotipe/core";
import type React from "react";

export function TableView({ block, children }: { block: BlockView; children?: React.ReactNode }) {
  return (
    <div data-block-id={block.id} data-block-type="table" className="gotipe-table-wrapper">
      <table>{children}</table>
    </div>
  );
}
