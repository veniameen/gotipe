import type { FallbackDoc } from "./types";

/** Replacing through apply preserves an enabled CRDT replica and its identity. */
export function replacementTransaction(beforeJson: string, afterJson: string): string {
  const before = JSON.parse(beforeJson) as FallbackDoc;
  const after = JSON.parse(afterJson) as FallbackDoc;
  return JSON.stringify({
    metadata: {},
    selection: null,
    steps: [
      ...before.blocks.map((block) => ({ DeleteBlock: { block_id: block.id } })),
      ...after.blocks.map((block, index) => ({ InsertBlock: { parent_id: null, index, block } })),
    ],
  });
}
