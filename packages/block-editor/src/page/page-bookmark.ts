import type { BlockView, GoTipeEditor } from "@gotipe/core";

/** A point in a block's text. */
export interface TextPoint {
  blockId: string;
  offset: number;
}

/**
 * A place in the page that follows edits until it is released (`PageEditorHandle.bookmark`).
 * Edits in its block before it move it; text inserted right at it goes before it (`"after"`) or
 * after it (`"before"`). It follows its text into a new block when the block is split (Enter) and
 * into the block before when the two are joined. It is lost while its block is gone or text on
 * both sides of it is replaced, and comes back when its block's text is back as it was (the
 * document replaced and restored, an undo).
 */
export interface PageBookmark {
  /** Where the place is now, or null when it is lost or released. */
  resolve(): TextPoint | null;
  /** Stops following edits; `resolve()` returns null from then on. */
  release(): void;
}

/** Every block's text by id, in document order. */
export function textsOf(blocks: BlockView[], out = new Map<string, string>()): Map<string, string> {
  for (const block of blocks) {
    out.set(
      block.id,
      Array.isArray(block.content)
        ? block.content.map((span) => span.text).join("")
        : typeof block.content === "string"
          ? block.content
          : "",
    );
    textsOf(block.children, out);
  }
  return out;
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

/** The id before and after `id` in document order. */
function neighbours(texts: Map<string, string>, id: string): { prev?: string; next?: string } {
  const ids = [...texts.keys()];
  const at = ids.indexOf(id);
  return at < 0 ? {} : { prev: ids[at - 1], next: ids[at + 1] };
}

/**
 * Where `place` stands after the document went from `before` to `after` (each block's text by id
 * in document order), or null when it is lost.
 */
export function followPlace(
  before: Map<string, string>,
  after: Map<string, string>,
  place: TextPoint,
  bias: "before" | "after",
): TextPoint | null {
  const was = before.get(place.blockId);
  const now = after.get(place.blockId);
  if (was === undefined) return now === undefined ? null : place;
  if (now === undefined) {
    // joined to the block before it (Backspace at its start): its text ends that block now
    const { prev } = neighbours(before, place.blockId);
    const head = prev === undefined ? undefined : before.get(prev);
    if (prev !== undefined && head !== undefined && after.get(prev) === head + was) {
      return { blockId: prev, offset: head.length + place.offset };
    }
    return null;
  }
  // split (Enter): the block keeps the text up to the cut, a new block after it the rest
  const cut = now.length;
  if (cut < was.length && was.startsWith(now)) {
    const { next } = neighbours(after, place.blockId);
    const moved = next === undefined || before.has(next) ? undefined : after.get(next);
    const past = place.offset > cut || (place.offset === cut && bias === "after");
    if (next !== undefined && moved?.startsWith(was.slice(cut)) && past) {
      return { blockId: next, offset: place.offset - cut };
    }
  }
  const offset = mapOffset(was, now, place.offset, bias);
  return offset === null ? null : { blockId: place.blockId, offset };
}

/** A lost place back where its block's text is again as it was, or null. */
function findAgain(after: Map<string, string>, lost: TextPoint, text: string): TextPoint | null {
  if (after.get(lost.blockId) === text) return { ...lost };
  if (text.length === 0) return null;
  let found: string | null = null;
  for (const [id, value] of after) {
    if (value !== text) continue;
    if (found !== null) return null; // not one block: unknown which
    found = id;
  }
  return found === null ? null : { blockId: found, offset: lost.offset };
}

/** Follows `point` through the editor's updates; the caller releases it. */
export function createBookmark(
  editor: GoTipeEditor,
  point: TextPoint,
  bias: "before" | "after",
  onRelease: (bookmark: PageBookmark) => void,
): PageBookmark {
  let texts = textsOf(editor.getViewState().blocks);
  const start = texts.get(point.blockId);
  let place: TextPoint | null =
    start !== undefined && point.offset >= 0 && point.offset <= start.length ? { ...point } : null;
  // the last place it had and its block's text then, while it is lost
  let lost: { place: TextPoint; text: string } | null = null;
  let off: (() => void) | null = null;
  const follow = () => {
    const next = textsOf(editor.getViewState().blocks);
    if (place) {
      const moved = followPlace(texts, next, place, bias);
      if (!moved) lost = { place, text: texts.get(place.blockId) ?? "" };
      place = moved;
    } else if (lost) {
      place = findAgain(next, lost.place, lost.text);
      if (place) lost = null;
    }
    texts = next;
  };
  const bookmark: PageBookmark = {
    resolve: () => {
      if (off) follow();
      return place ? { ...place } : null;
    },
    release: () => {
      off?.();
      off = null;
      place = null;
      lost = null;
      onRelease(bookmark);
    },
  };
  if (place) off = editor.on("update", follow);
  return bookmark;
}
