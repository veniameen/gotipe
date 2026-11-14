import type { BlockView, Decoration, GoTipeEditor } from "@gotipe/core";
import { countCharacters, fitCharacters, getCharacterCount } from "@gotipe/core/extensions";

/** The decoration layer of text past a character limit (Atlas frame 26). */
export const OVER_LIMIT_LAYER = "characterLimit";

type Content = BlockView["content"];
/** Text and grapheme count of a block's content; content objects are reused while unchanged. */
type Counted = { text: string; count: number };
export type CountCache = Map<string, { content: Content; counted: Counted }>;

function counted(block: BlockView, cache: CountCache): Counted {
  const hit = cache.get(block.id);
  if (hit && hit.content === block.content) return hit.counted;
  const text = Array.isArray(block.content)
    ? block.content.map((span) => span.text).join("")
    : typeof block.content === "string"
      ? block.content
      : "";
  const value = { text, count: countCharacters(text) };
  cache.set(block.id, { content: block.content, counted: value });
  return value;
}

/**
 * Ranges of the text that does not fit in `limit` characters, counted as `CharacterCount` counts
 * them: grapheme clusters of every block in document order, block boundaries not counted. Counts
 * of unchanged blocks come from `cache`; only the block the limit falls in is cut.
 */
export function overLimitRanges(
  blocks: readonly BlockView[],
  limit: number,
  cache: CountCache = new Map(),
): Decoration[] {
  const out: Decoration[] = [];
  let used = 0;
  const visit = (block: BlockView) => {
    if (block.content !== null) {
      const { text, count } = counted(block, cache);
      if (count > 0 && used + count > limit) {
        const from = used >= limit ? 0 : fitCharacters(text, limit - used).length;
        out.push({
          type: "inline",
          key: "over-limit",
          blockId: block.id,
          from,
          to: text.length,
          className: "gotipe-over-limit",
          attrs: { "data-gotipe-over-limit": "" },
        });
      }
      used += count;
    }
    for (const child of block.children) visit(child);
  };
  for (const block of blocks) visit(block);
  return out;
}

/**
 * Keeps the layer in step with the document while it is over `limit`: at most once a frame,
 * from cached block counts, and the layer is replaced only when its ranges change. Returns the
 * cleanup.
 */
export function paintOverLimit(editor: GoTipeEditor, limit: number | null): () => void {
  const cache: CountCache = new Map();
  let painted = "[]";
  let frame: number | null = null;
  const paint = () => {
    frame = null;
    if (editor.isDestroyed) return;
    // Only a document over the limit is walked; the counter already knows when it is.
    const over = limit !== null && (getCharacterCount(editor)?.characters() ?? 0) > limit;
    const ranges = over ? overLimitRanges(editor.getViewState().blocks, limit, cache) : [];
    if (!over) cache.clear();
    const key = JSON.stringify(
      ranges.map((range) => [
        range.blockId,
        (range as { from: number }).from,
        (range as { to: number }).to,
      ]),
    );
    if (key === painted) return;
    painted = key;
    editor.setDecorations(OVER_LIMIT_LAYER, ranges);
  };
  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(paint);
  };
  paint();
  const stop = editor.on("update", schedule);
  return () => {
    stop();
    if (frame !== null) cancelAnimationFrame(frame);
    if (painted !== "[]" && !editor.isDestroyed) editor.setDecorations(OVER_LIMIT_LAYER, []);
  };
}
