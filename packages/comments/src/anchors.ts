import { type Block, type Decoration, type Document, GoTipeError } from "@gotipe/core";
import { anchorAt, findAnchor } from "@gotipe/suggestions";
import type { Comment, CommentRange } from "./types";

interface TextBlock {
  blockId: string;
  text: string;
  start: number;
  end: number;
}
function projection(document: Document): { text: string; blocks: TextBlock[] } {
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
export function captureRange(document: Document, range: CommentRange) {
  const view = projection(document);
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
export function resolveComment(comment: Comment, document: Document): Comment {
  const view = projection(document);
  if (!comment.anchor) {
    try {
      return { ...comment, ...captureRange(document, comment) };
    } catch {
      return { ...comment, orphaned: true };
    }
  }
  const match = findAnchor(view.text, comment.anchor);
  if (!match.ok) return { ...comment, orphaned: true };
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
    quotedText: comment.anchor.quote,
    orphaned: false,
  };
}
export function commentDecorations(comment: Comment, document: Document): Decoration[] {
  if (comment.orphaned) return [];
  const blocks = projection(document).blocks;
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
