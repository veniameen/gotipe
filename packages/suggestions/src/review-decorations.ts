import type { BlockView, Decoration, MarkView, TextSpanView } from "@gotipe/core";
import { type LocatedEdit, findAnchor, locateEdits } from "./anchors";
import type {
  CommentState,
  ProposalState,
  ReviewComment,
  ReviewLane,
  ReviewPosition,
  ReviewProposal,
  TextMap,
} from "./review-types";

export interface ReviewInput {
  /** The editor document (view-state blocks). */
  blocks: BlockView[];
  /** The document serialized by the codec (e.g. Markdown). */
  text: string;
  /** Codec map for `text`. */
  map: TextMap;
  /** Parses a fragment of the codec format into top-level blocks (fresh ids). */
  parse: (fragment: string) => BlockView[];
  proposals: ReviewProposal[];
  comments?: ReviewComment[];
  lanes: ReviewLane[];
  /** Highlighted proposal or comment (its card is open). */
  activeId?: string | null;
}

export interface ReviewOutput {
  decorations: Decoration[];
  proposals: ProposalState[];
  comments: CommentState[];
}

// ---------------------------------------------------------------- helpers

const RAW_TYPES = new Set(["codeBlock", "markdownRaw", "math", "embed"]);

function plainText(block: BlockView): string {
  if (Array.isArray(block.content)) return block.content.map((s) => s.text).join("");
  if (typeof block.content === "string") return block.content;
  return "";
}

function stripIds(block: BlockView): unknown {
  return {
    t: block.type,
    a: block.attrs,
    c: Array.isArray(block.content)
      ? block.content.map((s) => [s.text, s.marks.map((m) => [m.type, m.attrs ?? {}])])
      : block.content,
    k: block.children.map(stripIds),
  };
}

function signature(block: BlockView): string {
  return JSON.stringify(stripIds(block));
}

function sameAttrs(a: BlockView, b: BlockView): boolean {
  return JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});
}

function sameSpans(a: BlockView, b: BlockView): boolean {
  return JSON.stringify(stripIds({ ...a, children: [] })) === JSON.stringify(stripIds({ ...b, children: [] }));
}

/** Spans of `spans` within `[from, to)`. */
function sliceSpans(spans: TextSpanView[], from: number, to: number): TextSpanView[] {
  const out: TextSpanView[] = [];
  let pos = 0;
  for (const span of spans) {
    const end = pos + span.text.length;
    const a = Math.max(from, pos);
    const b = Math.min(to, end);
    if (b > a) out.push({ text: span.text.slice(a - pos, b - pos), marks: span.marks });
    pos = end;
  }
  return out;
}

/** Longest common subsequence of two signature lists → matched index pairs. */
function lcs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

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
    else if (bias === "after" ? offset < g.mdTo && offset === best.mdTo : offset > g.mdFrom && offset === best.mdFrom) {
      best = g;
    }
  }
  if (best) {
    if (best.exact) {
      return { blockId: best.blockId, offset: Math.min(best.textTo, best.textFrom + (offset - best.mdFrom)) };
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

function findById(blocks: BlockView[], id: string): BlockView | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    const inner = findById(b.children, id);
    if (inner) return inner;
  }
  return null;
}

// ---------------------------------------------------------------- proposals

interface Ctx {
  pid: string;
  style: Record<string, string>;
  attrs: Record<string, string>;
  active: boolean;
  out: Decoration[];
  exact: boolean;
  position: ReviewPosition | null;
  insertEnd: ReviewPosition | null;
  inserted: number;
  seq: number;
}

function cls(ctx: Ctx, base: string): string {
  return ctx.active ? `${base} is-active` : base;
}

function key(ctx: Ctx, kind: string): string {
  ctx.seq += 1;
  return `${ctx.pid}:${String(ctx.seq).padStart(4, "0")}:${kind}`;
}

function note(ctx: Ctx, pos: ReviewPosition) {
  if (!ctx.position) ctx.position = pos;
}

function phantomId(ctx: Ctx, block: BlockView): BlockView {
  ctx.seq += 1;
  return {
    ...block,
    id: `phantom:${ctx.pid}:${ctx.seq}:${block.id}`,
    decorations: [],
    children: block.children.map((c) => phantomId(ctx, c)),
  };
}

function countText(block: BlockView): number {
  return plainText(block).length + block.children.reduce((n, c) => n + countText(c), 0);
}

function insertBlocks(ctx: Ctx, anchor: BlockView, position: "before" | "after", blocks: BlockView[]) {
  if (blocks.length === 0) return;
  ctx.exact = false;
  const phantoms = blocks.map((b) => phantomId(ctx, b));
  ctx.out.push({
    type: "blocks",
    key: key(ctx, "blocks"),
    blockId: anchor.id,
    position,
    blocks: phantoms,
    className: cls(ctx, "gotipe-sug gotipe-sug-block-ins"),
    attrs: ctx.attrs,
    style: ctx.style,
  });
  ctx.inserted += blocks.reduce((n, b) => n + countText(b), 0);
  note(ctx, { blockId: anchor.id, offset: position === "after" ? plainText(anchor).length : 0 });
  ctx.insertEnd = { blockId: anchor.id, offset: plainText(anchor).length };
}

function markBlock(ctx: Ctx, block: BlockView, kind: "del" | "changed") {
  ctx.exact = false;
  ctx.out.push({
    type: "node",
    key: key(ctx, kind),
    blockId: block.id,
    className: cls(ctx, kind === "del" ? "gotipe-sug gotipe-sug-block-del" : "gotipe-sug gotipe-sug-block-changed"),
    attrs: ctx.attrs,
    style: ctx.style,
  });
  note(ctx, { blockId: block.id, offset: 0 });
}

function diffLeafText(ctx: Ctx, oldB: BlockView, newB: BlockView) {
  const ot = plainText(oldB);
  const nt = plainText(newB);
  if (ot === nt) {
    if (!sameAttrs(oldB, newB) || !sameSpans(oldB, newB)) markBlock(ctx, oldB, "changed");
    return;
  }
  let p = 0;
  const max = Math.min(ot.length, nt.length);
  while (p < max && ot.charCodeAt(p) === nt.charCodeAt(p)) p++;
  let s = 0;
  while (s < max - p && ot.charCodeAt(ot.length - 1 - s) === nt.charCodeAt(nt.length - 1 - s)) s++;
  const delFrom = p;
  const delTo = ot.length - s;
  if (delTo > delFrom) {
    ctx.out.push({
      type: "inline",
      key: key(ctx, "del"),
      blockId: oldB.id,
      from: delFrom,
      to: delTo,
      className: cls(ctx, "gotipe-sug gotipe-sug-del"),
      attrs: ctx.attrs,
      style: ctx.style,
    });
    note(ctx, { blockId: oldB.id, offset: delFrom });
  }
  const insTo = nt.length - s;
  if (insTo > p) {
    const spans = Array.isArray(newB.content) ? sliceSpans(newB.content, p, insTo) : [{ text: nt.slice(p, insTo), marks: [] }];
    for (const span of spans) {
      ctx.out.push({
        type: "widget",
        key: key(ctx, "ins"),
        blockId: oldB.id,
        offset: delTo,
        text: span.text,
        marks: span.marks as MarkView[],
        className: cls(ctx, "gotipe-sug gotipe-sug-ins"),
        attrs: ctx.attrs,
        style: ctx.style,
      });
      ctx.inserted += span.text.length;
    }
    note(ctx, { blockId: oldB.id, offset: delTo });
    ctx.insertEnd = { blockId: oldB.id, offset: delTo };
  }
  if (!sameAttrs(oldB, newB)) markBlock(ctx, oldB, "changed");
}

function diffBlock(ctx: Ctx, oldB: BlockView, newB: BlockView) {
  if (oldB.type !== newB.type || RAW_TYPES.has(oldB.type)) {
    markBlock(ctx, oldB, "del");
    insertBlocks(ctx, oldB, "after", [newB]);
    return;
  }
  const hasText = Array.isArray(oldB.content) || Array.isArray(newB.content);
  if (hasText) diffLeafText(ctx, oldB, newB);
  else if (!sameAttrs(oldB, newB)) markBlock(ctx, oldB, "changed");
  if (oldB.children.length > 0 || newB.children.length > 0) {
    diffLists(ctx, oldB.children, newB.children, oldB);
  }
}

function diffLists(ctx: Ctx, oldList: BlockView[], newList: BlockView[], parent: BlockView | null) {
  const oldSig = oldList.map(signature);
  const newSig = newList.map(signature);
  const matches = lcs(oldSig, newSig);
  let oi = 0;
  let ni = 0;
  const flushGap = (oEnd: number, nEnd: number) => {
    const olds = oldList.slice(oi, oEnd);
    const news = newList.slice(ni, nEnd);
    const paired = Math.min(olds.length, news.length);
    for (let k = 0; k < paired; k++) {
      const o = olds[k]!;
      const n = news[k]!;
      if (o.type === n.type) diffBlock(ctx, o, n);
      else {
        markBlock(ctx, o, "del");
        insertBlocks(ctx, o, "after", [n]);
      }
    }
    for (let k = paired; k < olds.length; k++) markBlock(ctx, olds[k]!, "del");
    const added = news.slice(paired);
    if (added.length > 0) {
      const lastOld = oEnd > 0 ? oldList[oEnd - 1] : undefined;
      const nextOld = oldList[oEnd];
      if (lastOld) insertBlocks(ctx, lastOld, "after", added);
      else if (nextOld) insertBlocks(ctx, nextOld, "before", added);
      else if (parent) insertBlocks(ctx, parent, "after", added);
    }
    oi = oEnd;
    ni = nEnd;
  };
  for (const [mo, mn] of matches) {
    flushGap(mo, mn);
    oi = mo + 1;
    ni = mn + 1;
  }
  flushGap(oldList.length, newList.length);
}

interface Cluster {
  start: number;
  end: number;
  edits: LocatedEdit[];
  blockIds: string[];
}

function clusterEdits(map: TextMap, edits: LocatedEdit[]): Cluster[] {
  const top = map.blocks.filter((b) => b.depth === 0).sort((a, b) => a.start - b.start);
  const clusters: Cluster[] = [];
  for (const e of edits) {
    const affected = top.filter((b) =>
      e.start === e.end ? b.start <= e.start && e.start <= b.end : b.start < e.end && b.end > e.start,
    );
    const start = Math.min(e.start, ...affected.map((b) => b.start));
    const end = Math.max(e.end, ...affected.map((b) => b.end));
    const last = clusters[clusters.length - 1];
    if (last && start <= last.end && affected.length > 0 && last.blockIds.length > 0) {
      last.end = Math.max(last.end, end);
      last.edits.push(e);
      for (const b of affected) if (!last.blockIds.includes(b.blockId)) last.blockIds.push(b.blockId);
    } else {
      clusters.push({ start, end, edits: [e], blockIds: affected.map((b) => b.blockId) });
    }
  }
  return clusters;
}

function computeProposal(input: ReviewInput, proposal: ReviewProposal, lane: ReviewLane | undefined): {
  state: ProposalState;
  decorations: Decoration[];
} {
  const ctx: Ctx = {
    pid: proposal.id,
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
    status: "pending",
    position: null,
    insertEnd: null,
    blockIds: [],
    exact: true,
    insertedChars: 0,
  };
  const located = proposal.status === "stale" ? null : locateEdits(input.text, proposal.edits);
  if (!located || !located.ok) {
    return {
      state: {
        ...base,
        status: "stale",
        reason: located && !located.ok ? located.reason : undefined,
        position: staleWidget(input, proposal, ctx),
      },
      decorations: ctx.out,
    };
  }
  const top = input.map.blocks.filter((b) => b.depth === 0).sort((a, b) => a.start - b.start);
  const touched: string[] = [];
  for (const cluster of clusterEdits(input.map, located.edits)) {
    let region = input.text.slice(cluster.start, cluster.end);
    for (let i = cluster.edits.length - 1; i >= 0; i--) {
      const e = cluster.edits[i]!;
      region = region.slice(0, e.start - cluster.start) + e.text + region.slice(e.end - cluster.start);
    }
    const newBlocks = input.parse(region);
    const oldBlocks = cluster.blockIds
      .map((id) => input.blocks.find((b) => b.id === id))
      .filter((b): b is BlockView => !!b);
    touched.push(...cluster.blockIds);
    if (oldBlocks.length === 0) {
      // Pure insertion between blocks.
      const at = cluster.start;
      const prev = [...top].reverse().find((b) => b.end <= at);
      const next = top.find((b) => b.start >= at);
      const prevBlock = prev ? input.blocks.find((b) => b.id === prev.blockId) : undefined;
      const nextBlock = next ? input.blocks.find((b) => b.id === next.blockId) : undefined;
      if (prevBlock) insertBlocks(ctx, prevBlock, "after", newBlocks);
      else if (nextBlock) insertBlocks(ctx, nextBlock, "before", newBlocks);
      continue;
    }
    diffLists(ctx, oldBlocks, newBlocks, null);
  }
  return {
    state: {
      ...base,
      position: ctx.position,
      insertEnd: ctx.insertEnd,
      blockIds: touched,
      exact: ctx.exact,
      insertedChars: ctx.inserted,
    },
    decorations: ctx.out,
  };
}

/** Best-effort place for a stale proposal: after its `before`, or before its `after`. */
function staleWidget(input: ReviewInput, proposal: ReviewProposal, ctx: Ctx): ReviewPosition | null {
  const edit = proposal.edits[0];
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
  const deepText = (b: BlockView): string =>
    [plainText(b), ...b.children.map(deepText)].filter((t) => t.length > 0).join(" ");
  const text = (parsed.map(deepText).join(" ") || edit.quote).slice(0, 240);
  if (text) {
    ctx.out.push({
      type: "widget",
      key: key(ctx, "stale"),
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

// ---------------------------------------------------------------- comments

function computeComment(input: ReviewInput, comment: ReviewComment, lane: ReviewLane | undefined, out: Decoration[]): CommentState {
  const match = findAnchor(input.text, comment.anchor);
  if (!match.ok) return { id: comment.id, status: "stale", position: null };
  const active = input.activeId === comment.id;
  const className = `gotipe-cmt${active ? " is-active" : ""}`;
  const attrs = { "data-gotipe-comment": comment.id, "data-gotipe-lane": comment.laneId };
  const style = { "--gt-track": lane?.color ?? "var(--gt-track-3)" };
  if (match.start === match.end) {
    const pos = mapOffsetToText(input.map, match.start, "after");
    if (!pos) return { id: comment.id, status: "stale", position: null };
    out.push({ type: "widget", key: `${comment.id}:pt`, blockId: pos.blockId, offset: pos.offset, className: `${className} gotipe-cmt-point`, attrs, style });
    return { id: comment.id, status: "anchored", position: pos };
  }
  const ranges = mapRangeToText(input.map, match.start, match.end);
  ranges.forEach((r, i) => {
    if (r.to > r.from) {
      out.push({ type: "inline", key: `${comment.id}:${i}`, blockId: r.blockId, from: r.from, to: r.to, className, attrs, style });
    }
  });
  const first = ranges[0];
  return {
    id: comment.id,
    status: first ? "anchored" : "stale",
    position: first ? { blockId: first.blockId, offset: first.from } : null,
  };
}

/**
 * Binds proposals and comments to the current document: locates anchors in
 * the serialized text, re-parses the changed region and diffs it against the
 * editor blocks. Inline changes become `inline` (struck old text) and
 * `widget` (new text) decorations; new blocks become phantom `blocks`;
 * removed or rewritten blocks get `node` decorations. A proposal whose
 * anchor is not found exactly once is stale.
 */
export function computeReviewDecorations(input: ReviewInput): ReviewOutput {
  const lanes = new Map(input.lanes.map((l) => [l.id, l] as const));
  const decorations: Decoration[] = [];
  const proposals: ProposalState[] = [];
  for (const proposal of input.proposals) {
    const { state, decorations: own } = computeProposal(input, proposal, lanes.get(proposal.laneId));
    proposals.push(state);
    decorations.push(...own);
  }
  const comments: CommentState[] = [];
  for (const comment of input.comments ?? []) {
    comments.push(computeComment(input, comment, lanes.get(comment.laneId), decorations));
  }
  return { decorations, proposals, comments };
}

/** Document order of proposals by their first position (stale ones last). */
export function proposalsInDocumentOrder(blocks: BlockView[], states: ProposalState[]): ProposalState[] {
  const order = new Map<string, number>();
  let i = 0;
  const walk = (list: BlockView[]) => {
    for (const b of list) {
      order.set(b.id, i++);
      walk(b.children);
    }
  };
  walk(blocks);
  return [...states].sort((a, b) => {
    if (a.status !== b.status) return a.status === "stale" ? 1 : -1;
    const pa = a.position ? (order.get(a.position.blockId) ?? 0) * 1e6 + a.position.offset : Number.MAX_SAFE_INTEGER;
    const pb = b.position ? (order.get(b.position.blockId) ?? 0) * 1e6 + b.position.offset : Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });
}

/**
 * The reveal animation: keeps the first `chars` characters of a proposal's
 * new text (widgets and phantom blocks, in order) and drops the rest.
 */
export function revealDecorations(decorations: Decoration[], proposalId: string, chars: number): Decoration[] {
  let left = chars;
  const prefix = `${proposalId}:`;
  const truncateBlock = (block: BlockView): BlockView | null => {
    if (left <= 0) return null;
    let content = block.content;
    if (Array.isArray(content)) {
      const total = content.reduce((n, s) => n + s.text.length, 0);
      const keep = Math.min(total, left);
      content = sliceSpans(content, 0, keep);
      left -= keep;
    } else if (typeof content === "string") {
      const keep = Math.min(content.length, left);
      content = content.slice(0, keep);
      left -= keep;
    }
    const children: BlockView[] = [];
    for (const child of block.children) {
      const c = truncateBlock(child);
      if (c) children.push(c);
    }
    return { ...block, content, children };
  };
  const out: Decoration[] = [];
  for (const d of decorations) {
    if (!("key" in d) || typeof d.key !== "string" || !d.key.startsWith(prefix)) {
      out.push(d);
      continue;
    }
    if (d.type === "widget" && d.text) {
      if (left <= 0) continue;
      const keep = Math.min(d.text.length, left);
      left -= keep;
      out.push({ ...d, text: d.text.slice(0, keep) });
    } else if (d.type === "blocks") {
      const blocks: BlockView[] = [];
      for (const b of d.blocks) {
        const t = truncateBlock(b);
        if (t) blocks.push(t);
      }
      if (blocks.length > 0) out.push({ ...d, blocks });
    } else {
      out.push(d);
    }
  }
  return out;
}

export { findById as findBlockById };
