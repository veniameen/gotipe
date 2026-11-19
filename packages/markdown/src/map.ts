import type { MarkdownMap, TextSegment } from "./types";

function textAt(seg: TextSegment, mdOffset: number, bias: "before" | "after"): number {
  if (seg.exact) {
    return Math.min(seg.textTo, seg.textFrom + Math.max(0, mdOffset - seg.mdFrom));
  }
  if (mdOffset <= seg.mdFrom) return seg.textFrom;
  if (mdOffset >= seg.mdTo) return seg.textTo;
  return bias === "after" ? seg.textTo : seg.textFrom;
}

/**
 * Markdown offset -> position in a block's text. Offsets inside syntax
 * (delimiters, prefixes) snap to the neighbouring text according to `bias`.
 */
export function mdOffsetToText(
  map: MarkdownMap,
  mdOffset: number,
  bias: "before" | "after" = "before",
): { blockId: string; offset: number } | null {
  const segs = map.segments;
  // Segments containing the offset (inclusive bounds).
  let lo = 0;
  let hi = segs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid]!.mdFrom <= mdOffset) lo = mid + 1;
    else hi = mid;
  }
  // segs[0..lo) have mdFrom <= mdOffset
  const containing: TextSegment[] = [];
  for (let i = lo - 1; i >= 0 && containing.length < 4; i--) {
    const s = segs[i]!;
    if (s.mdTo >= mdOffset) containing.unshift(s);
    else if (s.mdTo < mdOffset - 4096) break;
  }
  if (containing.length > 0) {
    // Prefer a segment strictly containing the offset, then by bias at boundaries.
    const strict = containing.find((s) => s.mdFrom < mdOffset && mdOffset < s.mdTo);
    if (strict) return { blockId: strict.blockId, offset: textAt(strict, mdOffset, bias) };
    const chosen =
      bias === "after"
        ? (containing.find((s) => s.mdFrom === mdOffset) ?? containing[containing.length - 1]!)
        : (containing.find((s) => s.mdTo === mdOffset) ?? containing[0]!);
    return { blockId: chosen.blockId, offset: textAt(chosen, mdOffset, bias) };
  }
  // Not inside text: find the innermost block containing the offset.
  let block: { blockId: string; depth: number } | null = null;
  for (const b of map.blocks) {
    if (b.start <= mdOffset && mdOffset <= b.end && (!block || b.depth >= block.depth)) {
      block = b;
    }
  }
  const prev = lo > 0 ? segs[lo - 1] : undefined;
  const next = segs[lo];
  if (block) {
    const id = block.blockId;
    let before: TextSegment | undefined;
    let after: TextSegment | undefined;
    for (let i = lo - 1; i >= 0; i--) {
      if (segs[i]!.blockId === id) {
        before = segs[i];
        break;
      }
    }
    for (let i = lo; i < segs.length; i++) {
      if (segs[i]!.blockId === id) {
        after = segs[i];
        break;
      }
    }
    if (bias === "after") {
      if (after) return { blockId: id, offset: after.textFrom };
      if (before) return { blockId: id, offset: before.textTo };
    } else {
      if (before) return { blockId: id, offset: before.textTo };
      if (after) return { blockId: id, offset: after.textFrom };
    }
    return { blockId: id, offset: 0 };
  }
  if (bias === "after") {
    if (next) return { blockId: next.blockId, offset: next.textFrom };
    if (prev) return { blockId: prev.blockId, offset: prev.textTo };
  } else {
    if (prev) return { blockId: prev.blockId, offset: prev.textTo };
    if (next) return { blockId: next.blockId, offset: next.textFrom };
  }
  return null;
}

/**
 * Position in a block's text -> Markdown offset. Where the position is the edge of a mark
 * (`**bold**|`), `bias` says which side of its delimiters the offset stands: `"after"` (default)
 * past them, at the text that follows, `"before"` before them, at the end of the text before.
 */
export function textOffsetToMd(
  map: MarkdownMap,
  blockId: string,
  offset: number,
  bias: "before" | "after" = "after",
): number | null {
  let best: TextSegment | null = null;
  let ending: TextSegment | null = null;
  let last: TextSegment | null = null;
  let first: TextSegment | null = null;
  for (const s of map.segments) {
    if (s.blockId !== blockId) continue;
    if (!first || s.textFrom < first.textFrom) first = s;
    if (!last || s.textTo > last.textTo) last = s;
    if (s.textFrom <= offset && offset <= s.textTo) {
      // Prefer the segment that strictly contains the offset, then the earliest.
      if (!best) best = s;
      else if (offset < s.textTo && offset >= s.textFrom && !(offset < best.textTo)) best = s;
      // before: the first segment whose text runs up to the offset
      if (!ending && s.textFrom < offset) ending = s;
    }
  }
  if (bias === "before" && ending) best = ending;
  if (best) {
    if (best.exact) return best.mdFrom + (offset - best.textFrom);
    if (offset <= best.textFrom) return best.mdFrom;
    if (offset >= best.textTo) return best.mdTo;
    return Math.min(best.mdTo, best.mdFrom + (offset - best.textFrom));
  }
  if (last && offset > last.textTo) return last.mdTo;
  if (first && offset < first.textFrom) return first.mdFrom;
  const block = map.blocks.find((b) => b.blockId === blockId);
  return block ? block.start : null;
}

/**
 * A range of the text (`from` to `to`, in document order) -> `[start, end)` in the Markdown, with
 * no mark delimiters at its edges: the start past them, the end before them. A collapsed range
 * stays collapsed.
 */
export function textRangeToMd(
  map: MarkdownMap,
  from: { blockId: string; offset: number },
  to: { blockId: string; offset: number },
): { start: number; end: number } | null {
  const start = textOffsetToMd(map, from.blockId, from.offset, "after");
  const end = textOffsetToMd(map, to.blockId, to.offset, "before");
  if (start === null || end === null) return null;
  return { start, end: Math.max(start, end) };
}
