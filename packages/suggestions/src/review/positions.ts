import type { BlockView } from "@gotipe/core";
import type { ReviewPosition, TextMap } from "../review-types";

/** Markdown offset → editor position. */
export function mapOffsetToText(
  map: TextMap,
  offset: number,
  bias: "before" | "after" = "after",
): ReviewPosition | null {
  let best: TextMap["segments"][number] | null = null;
  for (const g of map.segments) {
    if (offset < g.mdFrom || offset > g.mdTo) continue;
    if (!best) best = g;
    else if (
      bias === "after"
        ? offset < g.mdTo && offset === best.mdTo
        : offset > g.mdFrom && offset === best.mdFrom
    ) {
      best = g;
    }
  }
  if (best) {
    if (best.exact) {
      return {
        blockId: best.blockId,
        offset: Math.min(best.textTo, best.textFrom + (offset - best.mdFrom)),
      };
    }
    return { blockId: best.blockId, offset: offset <= best.mdFrom ? best.textFrom : best.textTo };
  }
  // No text there (an empty block, e.g. a table cell): the deepest block
  // whose source range holds the offset, at its start.
  let holder: TextMap["blocks"][number] | null = null;
  for (const b of map.blocks) {
    if (offset >= b.start && offset <= b.end && (!holder || b.depth > holder.depth)) holder = b;
  }
  if (holder && holder.depth > 0 && !map.segments.some((g) => g.blockId === holder!.blockId)) {
    return { blockId: holder.blockId, offset: 0 };
  }
  if (bias === "after") {
    const next = map.segments.find((g) => g.mdFrom >= offset);
    if (next) return { blockId: next.blockId, offset: next.textFrom };
    const last = map.segments[map.segments.length - 1];
    return last ? { blockId: last.blockId, offset: last.textTo } : null;
  }
  for (let i = map.segments.length - 1; i >= 0; i--) {
    const g = map.segments[i]!;
    if (g.mdTo <= offset) return { blockId: g.blockId, offset: g.textTo };
  }
  const first = map.segments[0];
  return first ? { blockId: first.blockId, offset: first.textFrom } : null;
}

/** Markdown range → text ranges per block (document order). */
export function mapRangeToText(
  map: TextMap,
  start: number,
  end: number,
): { blockId: string; from: number; to: number }[] {
  const byBlock = new Map<string, { blockId: string; from: number; to: number }>();
  const order: string[] = [];
  for (const g of map.segments) {
    const lo = Math.max(start, g.mdFrom);
    const hi = Math.min(end, g.mdTo);
    if (hi < lo || (hi === lo && start !== end)) continue;
    const from = g.exact ? g.textFrom + (lo - g.mdFrom) : g.textFrom;
    const to = g.exact ? g.textFrom + (hi - g.mdFrom) : g.textTo;
    const prev = byBlock.get(g.blockId);
    if (prev) {
      prev.from = Math.min(prev.from, from);
      prev.to = Math.max(prev.to, to);
    } else {
      byBlock.set(g.blockId, { blockId: g.blockId, from, to });
      order.push(g.blockId);
    }
  }
  return order.map((id) => byBlock.get(id)!);
}

export function findBlockById(blocks: BlockView[], id: string): BlockView | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    const inner = findBlockById(b.children, id);
    if (inner) return inner;
  }
  return null;
}
