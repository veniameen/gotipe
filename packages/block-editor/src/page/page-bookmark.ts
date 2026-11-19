import type { BlockView, GoTipeEditor } from "@gotipe/core";

/** A point in a block's text. */
export interface TextPoint {
  blockId: string;
  offset: number;
}

/**
 * A place in the page that follows edits until it is released (`PageEditorHandle.bookmark`).
 * Edits in its block before it move it; text inserted right at it goes before it (`"after"`) or
 * after it (`"before"`). It is lost when its block goes or when an edit replaces text on both
 * sides of it; text moved to another block (a split, say) is not followed.
 */
export interface PageBookmark {
  /** Where the place is now, or null when it is lost or released. */
  resolve(): TextPoint | null;
  /** Stops following edits; `resolve()` returns null from then on. */
  release(): void;
}

function blockText(blocks: BlockView[], id: string): string | null {
  for (const block of blocks) {
    if (block.id === id) {
      return Array.isArray(block.content)
        ? block.content.map((span) => span.text).join("")
        : typeof block.content === "string"
          ? block.content
          : "";
    }
    const inner = blockText(block.children, id);
    if (inner !== null) return inner;
  }
  return null;
}

/** Where `offset` in `before` stands in `after`, or null when the text around it was replaced. */
export function mapOffset(
  before: string,
  after: string,
  offset: number,
  bias: "before" | "after",
): number | null {
  if (before === after) return offset;
  const limit = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < limit && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  while (
    suffix < limit - prefix &&
    before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  )
    suffix++;
  const changedEnd = before.length - suffix;
  if (offset < prefix) return offset;
  if (offset > changedEnd) return offset + after.length - before.length;
  // at the edit: an insertion right at the place, or the place at an edge of replaced text
  if (prefix === changedEnd) return bias === "after" ? after.length - suffix : prefix;
  if (offset === prefix) return prefix;
  if (offset === changedEnd) return after.length - suffix;
  return null;
}

/** Follows `point` through the editor's updates; the caller releases it. */
export function createBookmark(
  editor: GoTipeEditor,
  point: TextPoint,
  bias: "before" | "after",
  onRelease: (bookmark: PageBookmark) => void,
): PageBookmark {
  let place: TextPoint | null = point;
  let text = blockText(editor.getViewState().blocks, point.blockId);
  if (text === null || point.offset < 0 || point.offset > text.length) place = null;
  let off: (() => void) | null = null;
  const follow = () => {
    if (!place || text === null) return;
    const next = blockText(editor.getViewState().blocks, place.blockId);
    const offset = next === null ? null : mapOffset(text, next, place.offset, bias);
    text = next;
    place = offset === null ? null : { blockId: place.blockId, offset };
    if (!place) stop();
  };
  const stop = () => {
    off?.();
    off = null;
  };
  const bookmark: PageBookmark = {
    resolve: () => {
      follow();
      return place ? { ...place } : null;
    },
    release: () => {
      stop();
      place = null;
      onRelease(bookmark);
    },
  };
  if (place) off = editor.on("update", follow);
  return bookmark;
}
