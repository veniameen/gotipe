import { blockTextLength, flattenBlocks } from "../document/tree";
import type { Selection, Step } from "../types/state";
import type { BlockView } from "../types/view";

type Point = { blockId: string; offset: number };

/** Steps that remove no block and shorten no text: a selection that fitted still fits. */
const KEEP_BLOCKS_AND_TEXT = new Set<Step["type"]>([
  "insertText",
  "addMark",
  "removeMark",
  "setBlockAttrs",
  "insertBlock",
  "moveBlock",
]);

/** Whether `steps` may leave a staged selection without its block or past its text. */
export function mayMoveSelection(steps: readonly Step[]): boolean {
  return steps.some((step) => !KEEP_BLOCKS_AND_TEXT.has(step.type));
}

function move(
  point: Point,
  before: BlockView[],
  after: Map<string, BlockView>,
  merges: Map<string, string>,
): Point | null {
  let { blockId, offset } = point;
  // A block merged into another goes on in it, after the text that block had.
  for (let hops = merges.size; hops-- > 0 && !after.has(blockId) && merges.has(blockId); ) {
    blockId = merges.get(blockId)!;
    const target = before.find((block) => block.id === blockId);
    offset += target ? blockTextLength(target) : 0;
  }
  const block = after.get(blockId);
  if (block) return { blockId, offset: Math.min(offset, blockTextLength(block)) };
  // A removed block gives way to the next text block that remains, else to the previous one's end.
  const at = before.findIndex((candidate) => candidate.id === blockId);
  const remains = (candidate: BlockView) => after.get(candidate.id)?.content != null;
  const next = before.slice(at + 1).find(remains);
  if (next) return { blockId: next.id, offset: 0 };
  const previous = before.slice(0, Math.max(at, 0)).reverse().find(remains);
  return previous
    ? { blockId: previous.id, offset: blockTextLength(after.get(previous.id)!) }
    : null;
}

/**
 * The selection a chain leaves (D-07). A selection staged with `setSelection`, `selectAll` or
 * `selectBlock` names blocks of the document as the chain found it, and the chain's own steps
 * may remove a block or shorten its text. A staged selection that still fits the result is kept;
 * otherwise each end moves the way the caret does: a block merged into another goes on in it
 * after the text that block had, a removed block gives way to the start of the next text block
 * that remains (or the end of the previous one), and an offset past the text goes to its end.
 * A removed selected block leaves a caret. `undefined` when no text block remains: the editor
 * then maps its own selection. A selection that names a block the chain never had, or a bad
 * offset, is returned as given for the dispatch to reject.
 */
export function chainSelection(
  staged: Selection,
  steps: readonly Step[],
  before: BlockView[],
  after: BlockView[],
): Selection | undefined {
  const old = flattenBlocks(before);
  const now = new Map(flattenBlocks(after).map((block) => [block.id, block] as const));
  if (staged.type === "multi") {
    const blockIds = staged.blockIds.filter((id) => now.has(id));
    if (blockIds.length === staged.blockIds.length) return staged;
    return blockIds.length ? { type: "multi", blockIds } : undefined;
  }
  const ends: Point[] =
    staged.type === "range"
      ? [staged.anchor, staged.head]
      : staged.type === "text"
        ? [
            { blockId: staged.blockId, offset: staged.from },
            { blockId: staged.blockId, offset: staged.to },
          ]
        : [{ blockId: staged.blockId, offset: staged.type === "cursor" ? staged.offset : 0 }];
  const fits = ({ blockId, offset }: Point) => {
    const block = now.get(blockId);
    return block !== undefined && offset <= blockTextLength(block);
  };
  const known = ({ blockId, offset }: Point) =>
    Number.isInteger(offset) &&
    offset >= 0 &&
    (now.has(blockId) || old.some((block) => block.id === blockId));
  if (ends.every(fits) || !ends.every(known)) return staged;
  const merges = new Map(
    steps.flatMap((step) =>
      step.type === "mergeBlocks" ? [[step.blockId, step.targetId] as const] : [],
    ),
  );
  const [anchor, head = anchor] = ends.map((point) => move(point, old, now, merges));
  if (!anchor || !head) return undefined;
  if (staged.type === "cursor" || staged.type === "block") return { type: "cursor", ...anchor };
  if (staged.type === "text" && anchor.blockId === head.blockId)
    return {
      type: "text",
      blockId: anchor.blockId,
      from: Math.min(anchor.offset, head.offset),
      to: Math.max(anchor.offset, head.offset),
    };
  return { type: "range", anchor, head };
}
