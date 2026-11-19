import type { BlockView, Decoration } from "@gotipe/core";
import { type LocatedEdit, findAnchor, locateEdits } from "../anchors";
import type {
  ProposalState,
  ReviewLane,
  ReviewPosition,
  ReviewProposal,
  TextMap,
} from "../review-types";
import { type Ctx, cls, diffLists, insertBlocks, plainText, widgetKey } from "./block-diff";
import type { ReviewInput } from "./input";
import { markLiveEnd } from "./live";
import { mapOffsetToText } from "./positions";

type TopBlock = TextMap["blocks"][number];

/** One call's input and what is read from it once for all its proposals. */
export interface Frame {
  input: ReviewInput;
  /** The map's top-level blocks in document order. */
  top: () => TopBlock[];
}

export function frameOf(input: ReviewInput): Frame {
  let top: TopBlock[] | null = null;
  return {
    input,
    top: () => {
      top ??= input.map.blocks.filter((b) => b.depth === 0).sort((a, b) => a.start - b.start);
      return top;
    },
  };
}

interface Cluster {
  start: number;
  end: number;
  edits: LocatedEdit[];
  blockIds: string[];
}

function clusterEdits(top: TopBlock[], edits: LocatedEdit[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const e of edits) {
    const affected = top.filter((b) =>
      e.start === e.end
        ? b.start <= e.start && e.start <= b.end
        : b.start < e.end && b.end > e.start,
    );
    const start = Math.min(e.start, ...affected.map((b) => b.start));
    const end = Math.max(e.end, ...affected.map((b) => b.end));
    const last = clusters[clusters.length - 1];
    if (last && start <= last.end && affected.length > 0 && last.blockIds.length > 0) {
      last.end = Math.max(last.end, end);
      last.edits.push(e);
      for (const b of affected)
        if (!last.blockIds.includes(b.blockId)) last.blockIds.push(b.blockId);
    } else {
      clusters.push({ start, end, edits: [e], blockIds: affected.map((b) => b.blockId) });
    }
  }
  return clusters;
}

/** A proposal's rank as the lead of its widgets' keys (see `widgetKey`). */
const rankKey = (rank: number) => `${String(rank).padStart(4, "0")}:`;

/**
 * One proposal bound to the document. `rank` is its place among the proposals (by `order`, then
 * by their order in the list).
 */
export function computeProposal(
  frame: Frame,
  proposal: ReviewProposal,
  lane: ReviewLane | undefined,
  rank: number,
): {
  state: ProposalState;
  decorations: Decoration[];
} {
  const { input } = frame;
  const live = proposal.live === true;
  const ctx: Ctx = {
    pid: proposal.id,
    rank: rankKey(rank),
    style: { "--gt-track": lane?.color ?? "var(--gt-track-1)" },
    attrs: { "data-gotipe-proposal": proposal.id, "data-gotipe-lane": proposal.laneId },
    active: input.activeId === proposal.id,
    out: [],
    exact: true,
    position: null,
    insertEnd: null,
    inserted: 0,
    seq: 0,
  };
  const base: ProposalState = {
    id: proposal.id,
    status: live ? "live" : "pending",
    position: null,
    insertEnd: null,
    blockIds: [],
    exact: true,
    insertedChars: 0,
  };
  // a growing text is read as the codec says an unfinished one is
  const read = live ? input.liveText : undefined;
  const edits = read
    ? proposal.edits.map((edit) => ({ ...edit, text: read(edit.text) }))
    : proposal.edits;
  const located = proposal.status === "stale" ? null : locateEdits(input.text, edits);
  if (!located || !located.ok) {
    return {
      state: {
        ...base,
        status: live ? "live" : "stale",
        reason: located && !located.ok ? located.reason : undefined,
        position: staleWidget(input, edits[0], ctx),
      },
      decorations: ctx.out,
    };
  }
  const top = frame.top();
  const touched: string[] = [];
  for (const cluster of clusterEdits(top, located.edits)) {
    let region = input.text.slice(cluster.start, cluster.end);
    for (let i = cluster.edits.length - 1; i >= 0; i--) {
      const e = cluster.edits[i]!;
      region =
        region.slice(0, e.start - cluster.start) + e.text + region.slice(e.end - cluster.start);
    }
    const newBlocks = input.parse(region);
    const oldBlocks = cluster.blockIds
      .map((id) => input.blocks.find((b) => b.id === id))
      .filter((b): b is BlockView => !!b);
    touched.push(...cluster.blockIds);
    if (oldBlocks.length === 0) {
      // Pure insertion between blocks.
      const at = cluster.start;
      let prev: TopBlock | undefined;
      for (let i = top.length - 1; i >= 0 && !prev; i--) if (top[i]!.end <= at) prev = top[i];
      const next = top.find((b) => b.start >= at);
      const prevBlock = prev ? input.blocks.find((b) => b.id === prev.blockId) : undefined;
      const nextBlock = next ? input.blocks.find((b) => b.id === next.blockId) : undefined;
      if (prevBlock) insertBlocks(ctx, prevBlock, "after", newBlocks);
      else if (nextBlock) insertBlocks(ctx, nextBlock, "before", newBlocks);
      continue;
    }
    diffLists(ctx, oldBlocks, newBlocks, null);
  }
  if (live) {
    markLiveEnd(ctx.out);
    // no text yet: the proposal stands where its text will start, after its last quote
    const last = located.edits[located.edits.length - 1];
    const start = last && !ctx.insertEnd ? mapOffsetToText(input.map, last.end, "before") : null;
    if (start) {
      ctx.insertEnd = start;
      ctx.position ??= start;
    }
  }
  return {
    state: {
      ...base,
      position: ctx.position,
      insertEnd: ctx.insertEnd,
      blockIds: touched,
      exact: ctx.exact,
      insertedChars: live ? 0 : ctx.inserted,
    },
    decorations: ctx.out,
  };
}

/** The blocks from the top level down to the block `id`, or an empty list. */
function pathTo(blocks: BlockView[], id: string): BlockView[] {
  for (const block of blocks) {
    if (block.id === id) return [block];
    const inner = pathTo(block.children, id);
    if (inner.length > 0) return [block, ...inner];
  }
  return [];
}

/**
 * A stale edit that adds lines shows its new blocks as blocks at the hint's place, not as text
 * in the neighbouring line: beside the deepest item of a list of the same kind (a new list item
 * stands as an item of that list), else beside the top-level block. False when there is none.
 */
function staleBlocks(
  input: ReviewInput,
  pos: ReviewPosition,
  position: "before" | "after",
  parsed: BlockView[],
  ctx: Ctx,
): boolean {
  const path = pathTo(input.blocks, pos.blockId);
  if (path.length === 0 || parsed.length === 0) return false;
  let anchor = path[0]!;
  let blocks = parsed;
  const only = parsed.length === 1 ? parsed[0]! : null;
  if (only && only.children.length > 0) {
    for (let i = path.length - 1; i >= 1; i--) {
      if (path[i - 1]!.type !== only.type) continue;
      anchor = path[i]!;
      blocks = only.children;
      break;
    }
  }
  insertBlocks(ctx, anchor, position, blocks, "gotipe-sug gotipe-sug-stale gotipe-sug-block-ins");
  return true;
}

/**
 * Best-effort place for a stale proposal: after its `before`, or before its `after`. An edit
 * that adds lines shows its blocks there; one inside a line, a hint in the text.
 */
function staleWidget(
  input: ReviewInput,
  edit: ReviewProposal["edits"][number] | undefined,
  ctx: Ctx,
): ReviewPosition | null {
  if (!edit) return null;
  let at: number | null = null;
  if (edit.before) {
    const m = findAnchor(input.text, { before: edit.before, quote: "", after: "" });
    if (m.ok) at = m.start;
  }
  if (at === null && edit.after) {
    const m = findAnchor(input.text, { before: "", quote: "", after: edit.after });
    if (m.ok) at = m.start;
  }
  if (at === null) return null;
  const pos = mapOffsetToText(input.map, at, "before");
  if (!pos) return null;
  const parsed = edit.text ? input.parse(edit.text) : [];
  if (edit.text.includes("\n")) {
    // no text before the place: the blocks go before the first block there
    const offset = at;
    const first = !input.map.segments.some((g) => g.mdFrom < offset);
    const place = first ? mapOffsetToText(input.map, offset, "after") : pos;
    if (place && staleBlocks(input, place, first ? "before" : "after", parsed, ctx)) return pos;
  }
  const deepText = (b: BlockView): string =>
    [plainText(b), ...b.children.map(deepText)].filter((t) => t.length > 0).join(" ");
  const text = (parsed.map(deepText).join(" ") || edit.quote).slice(0, 240);
  if (text) {
    ctx.out.push({
      type: "widget",
      key: widgetKey(ctx, "stale"),
      blockId: pos.blockId,
      offset: pos.offset,
      text,
      className: cls(ctx, "gotipe-sug gotipe-sug-stale"),
      attrs: ctx.attrs,
      style: ctx.style,
    });
  }
  return pos;
}
