import type { GoTipeEditor } from "@gotipe/core";
import { flatten, textOf } from "./document";
import type { AiComment } from "./types";

/** The unchanged start and end of `before` and `after`, the one or the other measured first. */
function unchanged(before: string, after: string, startFirst: boolean): [number, number] {
  const limit = Math.min(before.length, after.length);
  const head = (most: number) => {
    let size = 0;
    while (size < most && before[size] === after[size]) size++;
    return size;
  };
  const tail = (most: number) => {
    let size = 0;
    while (size < most && before[before.length - 1 - size] === after[after.length - 1 - size])
      size++;
    return size;
  };
  if (startFirst) {
    const start = head(limit);
    return [start, tail(limit - start)];
  }
  const end = tail(limit);
  return [head(limit - end), end];
}

/**
 * Where an edit of a block's text, `before` to `after`, put a comment on it: the same offsets
 * when the text changed after the quote, shifted when it changed before it, `null` when the
 * change touched the quote. The edit is read as one replaced range; with repeated characters
 * it can be placed two ways, and the comment stays if either leaves its quote whole.
 */
export function followQuote(comment: AiComment, before: string, after: string): AiComment | null {
  if (before === after) return comment;
  for (const startFirst of [true, false]) {
    const [start, end] = unchanged(before, after, startFirst);
    if (start >= comment.to) return comment;
    if (before.length - end <= comment.from) {
      const shift = after.length - before.length;
      return { ...comment, from: comment.from + shift, to: comment.to + shift };
    }
  }
  return null;
}

function blockTexts(editor: GoTipeEditor, comments: AiComment[]): Map<string, string> {
  const ids = new Set(comments.map((comment) => comment.blockId));
  return new Map(
    flatten(editor.getJSON().blocks)
      .filter((block) => ids.has(block.id))
      .map((block) => [block.id, textOf(block)]),
  );
}

/**
 * The comments of the last AI review and the text of their blocks they point into. They are
 * not collaborative anchors: after each edit, local or another replica's, every comment follows
 * the text of its block (`followQuote`), and one goes when its block is removed or the edit
 * touches its quote (D-181).
 */
export class AiReview {
  private list: AiComment[] = [];
  private texts = new Map<string, string>();

  constructor(private readonly editor: GoTipeEditor) {}

  get comments(): AiComment[] {
    return this.list;
  }

  set(comments: AiComment[]): void {
    // The comments of a new review, about the document as it is now.
    this.list = comments;
    this.texts = blockTexts(this.editor, comments);
  }

  follow(): boolean {
    // Follows the last edit; true when a comment moved or went.
    if (!this.list.length) return false;
    const now = blockTexts(this.editor, this.list);
    const next = this.list.flatMap((comment) => {
      const before = this.texts.get(comment.blockId);
      const after = now.get(comment.blockId);
      const moved =
        before === undefined || after === undefined ? null : followQuote(comment, before, after);
      return moved ? [moved] : [];
    });
    const changed =
      next.length !== this.list.length ||
      next.some((comment, index) => comment !== this.list[index]);
    this.list = next;
    this.texts = now;
    return changed;
  }
}
