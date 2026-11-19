import type { BlockView, Decoration } from "@gotipe/core";
import type { CommentState, ProposalState } from "./review-types";
import { sliceSpans } from "./review/block-diff";
import { cached, forget, remember } from "./review/cache";
import { computeComment } from "./review/comment";
import type { ReviewInput, ReviewOutput } from "./review/input";
import { keepDecorations, sameData } from "./review/keep";
import { computeProposal, frameOf } from "./review/proposal";

export { createReviewCache } from "./review/cache";
export type { ReviewCache } from "./review/cache";
export type { ReviewInput, ReviewOutput } from "./review/input";
export { findBlockById, mapOffsetToText, mapRangeToText } from "./review/positions";

/**
 * Binds proposals and comments to the current document: locates anchors in
 * the serialized text, re-parses the changed region and diffs it against the
 * editor blocks. Inline changes become `inline` (struck old text) and
 * `widget` (new text) decorations; new blocks become phantom `blocks`;
 * removed or rewritten blocks get `node` decorations. A proposal whose
 * anchor is not found exactly once is stale.
 *
 * Proposals that insert at one point stand by their `order`, then as listed. With
 * `input.cache` only what changed since the last call is bound again (see `ReviewCache`).
 */
export function computeReviewDecorations(input: ReviewInput): ReviewOutput {
  const lanes = new Map(input.lanes.map((l) => [l.id, l] as const));
  const cache = input.cache;
  if (cache) cache.call += 1;
  const frame = frameOf(input);
  const decorations: Decoration[] = [];
  const proposals = new Array<ProposalState>(input.proposals.length);
  const ranked = input.proposals
    .map((proposal, index) => ({ proposal, index }))
    .sort((a, b) => (a.proposal.order ?? 0) - (b.proposal.order ?? 0) || a.index - b.index);
  ranked.forEach(({ proposal, index }, rank) => {
    const lane = lanes.get(proposal.laneId);
    const known = cache && cached(cache.proposals, proposal.id, proposal, input, lane?.color, rank);
    if (cache && known) {
      known.call = cache.call;
      proposals[index] = known.state;
      decorations.push(...known.decorations);
      return;
    }
    let { state, decorations: own } = computeProposal(frame, proposal, lane, rank);
    if (cache) {
      const was = cache.proposals.get(proposal.id);
      if (was) {
        own = keepDecorations(was.decorations, own);
        if (sameData(was.state, state)) state = was.state;
      }
      remember(cache, cache.proposals, proposal.id, proposal, input, lane?.color, rank, state, own);
    }
    proposals[index] = state;
    decorations.push(...own);
  });
  const comments: CommentState[] = [];
  for (const comment of input.comments ?? []) {
    const lane = lanes.get(comment.laneId);
    const known = cache && cached(cache.comments, comment.id, comment, input, lane?.color, 0);
    if (cache && known) {
      known.call = cache.call;
      comments.push(known.state);
      decorations.push(...known.decorations);
      continue;
    }
    let own: Decoration[] = [];
    let state = computeComment(input, comment, lane, own);
    if (cache) {
      const was = cache.comments.get(comment.id);
      if (was) {
        own = keepDecorations(was.decorations, own);
        if (sameData(was.state, state)) state = was.state;
      }
      remember(cache, cache.comments, comment.id, comment, input, lane?.color, 0, state, own);
    }
    comments.push(state);
    decorations.push(...own);
  }
  if (cache) forget(cache);
  return { decorations, proposals, comments };
}

/** Document order of proposals by their first position (stale ones last). */
export function proposalsInDocumentOrder(
  blocks: BlockView[],
  states: ProposalState[],
): ProposalState[] {
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
    const stale = Number(a.status === "stale") - Number(b.status === "stale");
    if (stale !== 0) return stale;
    const pa = a.position
      ? (order.get(a.position.blockId) ?? 0) * 1e6 + a.position.offset
      : Number.MAX_SAFE_INTEGER;
    const pb = b.position
      ? (order.get(b.position.blockId) ?? 0) * 1e6 + b.position.offset
      : Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });
}

/**
 * The reveal animation: keeps the first `chars` characters of a proposal's
 * new text (widgets and phantom blocks, in order) and drops the rest.
 */
export function revealDecorations(
  decorations: Decoration[],
  proposalId: string,
  chars: number,
): Decoration[] {
  let left = chars;
  const own = (d: Decoration) => "attrs" in d && d.attrs?.["data-gotipe-proposal"] === proposalId;
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
    if (!own(d)) {
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
