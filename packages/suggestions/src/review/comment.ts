import type { Decoration } from "@gotipe/core";
import { findAnchor } from "../anchors";
import type { CommentState, ReviewComment, ReviewLane } from "../review-types";
import type { ReviewInput } from "./input";
import { mapOffsetToText, mapRangeToText } from "./positions";

/** One comment bound to the document; its decorations go to `out`. */
export function computeComment(
  input: ReviewInput,
  comment: ReviewComment,
  lane: ReviewLane | undefined,
  out: Decoration[],
): CommentState {
  const match = findAnchor(input.text, comment.anchor);
  if (!match.ok) return { id: comment.id, status: "stale", position: null };
  const active = input.activeId === comment.id;
  const className = `gotipe-cmt${active ? " is-active" : ""}`;
  const attrs = { "data-gotipe-comment": comment.id, "data-gotipe-lane": comment.laneId };
  const style = { "--gt-track": lane?.color ?? "var(--gt-track-3)" };
  if (match.start === match.end) {
    const pos = mapOffsetToText(input.map, match.start, "after");
    if (!pos) return { id: comment.id, status: "stale", position: null };
    out.push({
      type: "widget",
      key: `${comment.id}:pt`,
      blockId: pos.blockId,
      offset: pos.offset,
      className: `${className} gotipe-cmt-point`,
      attrs,
      style,
    });
    return { id: comment.id, status: "anchored", position: pos };
  }
  const ranges = mapRangeToText(input.map, match.start, match.end);
  ranges.forEach((r, i) => {
    if (r.to > r.from) {
      out.push({
        type: "inline",
        key: `${comment.id}:${i}`,
        blockId: r.blockId,
        from: r.from,
        to: r.to,
        className,
        attrs,
        style,
      });
    }
  });
  const first = ranges[0];
  return {
    id: comment.id,
    status: first ? "anchored" : "stale",
    position: first ? { blockId: first.blockId, offset: first.from } : null,
  };
}
