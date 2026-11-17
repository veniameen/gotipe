import { type Block, type Decoration, type Document, GoTipeError } from "@gotipe/core";
import { anchorAt, findAnchor } from "@gotipe/suggestions";
import type { FollowRange } from "./follow";
import type { Comment, CommentRange } from "./types";

interface TextBlock {
  blockId: string;
  text: string;
  start: number;
  end: number;
}
/** The document as comment anchors read it: the text of its blocks in order, joined by "\n". */
export interface DocumentText {
  text: string;
  blocks: TextBlock[];
}
/** The text a comment was last resolved in and how the text changed since then. */
export interface TextChange {
  previous: DocumentText;
  follow: FollowRange;
}
export function documentText(document: Document): DocumentText {
  const blocks: TextBlock[] = [];
  let text = "";
  const visit = (entries: Block[]) => {
    for (const block of entries) {
      if (block.content !== null) {
        const value =
          typeof block.content === "string"
            ? block.content
            : block.content.map((span) => span.text).join("");
        if (blocks.length) text += "\n";
        const start = text.length;
        text += value;
        blocks.push({ blockId: block.id, text: value, start, end: text.length });
      }
      visit(block.children);
    }
  };
  visit(document.blocks);
  return { text, blocks };
}
function validOffset(text: string, offset: number): boolean {
  return (
    Number.isSafeInteger(offset) &&
    offset >= 0 &&
    offset <= text.length &&
    !(
      offset > 0 &&
      offset < text.length &&
      /[\uD800-\uDBFF]/.test(text[offset - 1]!) &&
      /[\uDC00-\uDFFF]/.test(text[offset]!)
    )
  );
}
export function captureRange(view: DocumentText, range: CommentRange) {
  const start = view.blocks.find((block) => block.blockId === range.blockId);
  const end = view.blocks.find((block) => block.blockId === (range.endBlockId ?? range.blockId));
  if (
    !start ||
    !end ||
    !validOffset(start.text, range.from) ||
    !validOffset(end.text, range.to) ||
    start.start + range.from > end.start + range.to
  )
    throw new GoTipeError(
      "COMMENT_ACTION_FAILED",
      "Select a valid document text range for the comment",
    );
  const anchor = anchorAt(view.text, start.start + range.from, end.start + range.to);
  return {
    blockId: range.blockId,
    endBlockId: range.endBlockId,
    from: range.from,
    to: range.to,
    anchor,
    quotedText: anchor.quote,
    orphaned: false,
  };
}
/** Where the quote of `comment` is in `view` after `change`, if the change left the quote alone. */
function followQuote(comment: Comment, quote: string, view: DocumentText, change: TextChange) {
  const { previous, follow } = change;
  const first = previous.blocks.find((block) => block.blockId === comment.blockId);
  const last = previous.blocks.find(
    (block) => block.blockId === (comment.endBlockId ?? comment.blockId),
  );
  if (!first || !last) return null;
  const start = first.start + comment.from;
  const end = last.start + comment.to;
  if (previous.text.slice(start, end) !== quote) return null;
  const moved = follow(start, end);
  return moved && view.text.slice(moved.from, moved.to) === quote
    ? { start: moved.from, end: moved.to }
    : null;
}
/**
 * Finds the comment's quote in `view`. An anchored quote follows `change` when the change left the
 * quote itself alone, even if it rewrote the context around it: text typed right before or after
 * the quote, or at the start of its block. Otherwise the whole anchor, context and quote, must
 * occur exactly once (after Undo, a move, a reload, for an orphan). Missing or ambiguous text marks
 * the comment orphaned and keeps its last anchor, so Undo can bring it back. A context that no
 * longer names the quote's place is read again around it, so a reload finds the quote too.
 */
export function resolveComment(comment: Comment, view: DocumentText, change?: TextChange): Comment {
  if (!comment.anchor) {
    try {
      return { ...comment, ...captureRange(view, comment) };
    } catch {
      return { ...comment, orphaned: true };
    }
  }
  const { anchor } = comment;
  const followed =
    change && !comment.orphaned ? followQuote(comment, anchor.quote, view, change) : null;
  const found = findAnchor(view.text, anchor);
  const match = followed ?? (found.ok ? found : null);
  if (!match) return { ...comment, orphaned: true };
  const start = view.blocks.find((block) => block.start <= match.start && block.end >= match.start);
  const end = [...view.blocks]
    .reverse()
    .find((block) => block.start <= match.end && block.end >= match.end);
  if (!start || !end) return { ...comment, orphaned: true };
  return {
    ...comment,
    blockId: start.blockId,
    endBlockId: end.blockId === start.blockId ? undefined : end.blockId,
    from: match.start - start.start,
    to: match.end - end.start,
    anchor:
      found.ok && found.start === match.start
        ? anchor
        : anchorAt(view.text, match.start, match.end),
    quotedText: anchor.quote,
    orphaned: false,
  };
}
export function commentDecorations(comment: Comment, view: DocumentText): Decoration[] {
  if (comment.orphaned) return [];
  const { blocks } = view;
  const first = blocks.findIndex((block) => block.blockId === comment.blockId);
  const last = blocks.findIndex(
    (block) => block.blockId === (comment.endBlockId ?? comment.blockId),
  );
  if (first < 0 || last < first) return [];
  return blocks.slice(first, last + 1).map((block, index) => ({
    type: "comment-highlight",
    commentId: comment.id,
    blockId: block.blockId,
    from: index === 0 ? comment.from : 0,
    to: index === last - first ? comment.to : block.text.length,
    resolved: comment.resolved,
  }));
}
