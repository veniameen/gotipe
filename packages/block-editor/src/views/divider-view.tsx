import type { BlockView } from "@gotipe/core";

export function DividerView({ block }: { block: BlockView }) {
  return <hr data-block-id={block.id} data-block-type="divider" />;
}
