import type { BlockView, Decoration } from "@gotipe/core";

/** Marks the end of a growing proposal's text (a host draws a typing caret there). */
export const LIVE_CLASS = "gotipe-sug-live";

/** The last block's deepest last block takes the mark. */
function markLastBlock(blocks: BlockView[]): BlockView[] {
  const last = blocks[blocks.length - 1];
  if (!last) return blocks;
  const marked: BlockView =
    last.children.length > 0
      ? { ...last, children: markLastBlock(last.children) }
      : { ...last, decorations: [...last.decorations, markOf(last)] };
  return [...blocks.slice(0, -1), marked];
}

/**
 * The mark of a block: over the last piece of its text (one run of marks: a renderer draws it
 * as one element), or on the block itself when it has no text of its own (an empty line, code).
 */
function markOf(block: BlockView): Decoration {
  const key = `${block.id}:live`;
  const spans = Array.isArray(block.content) ? block.content.filter((span) => span.text) : [];
  const last = spans[spans.length - 1];
  if (!last) return { type: "node", key, blockId: block.id, className: LIVE_CLASS };
  const to = spans.reduce((length, span) => length + span.text.length, 0);
  return {
    type: "inline",
    key,
    blockId: block.id,
    from: to - last.text.length,
    to,
    className: LIVE_CLASS,
  };
}

/**
 * Gives the last inserted piece of `decorations` (in document order) the `gotipe-sug-live`
 * class: an inline insertion itself; of new blocks, the last piece of the last block's text
 * (the block itself when it has no text: an empty line, a code block).
 */
export function markLiveEnd(decorations: Decoration[]): void {
  for (let i = decorations.length - 1; i >= 0; i--) {
    const d = decorations[i]!;
    if (d.type === "widget" && d.text) {
      decorations[i] = { ...d, className: `${d.className ?? ""} ${LIVE_CLASS}`.trim() };
      return;
    }
    if (d.type === "blocks" && d.blocks.length > 0) {
      decorations[i] = { ...d, blocks: markLastBlock(d.blocks) };
      return;
    }
  }
}
