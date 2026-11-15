import { blockTextLength, flattenBlocks } from "../document/tree";
import type { ViewState } from "../types/view";

type Caret = ViewState["selection"]["anchor"];

/**
 * Where `focus(position)` and the `autofocus` option put the caret: the start of the first
 * block with text or the end of the last one, in document order (into lists, toggles and
 * tables); a document without text takes its first or last block. Without a position the
 * current caret stays, or goes to the start of the first block when there is none. `null`:
 * the document has no blocks.
 */
export function focusCaret(
  blocks: ViewState["blocks"],
  position: "start" | "end" | undefined,
  current: Caret,
): Caret | null {
  if (!blocks.length) return null;
  if (!position && current.blockId) return current;
  const text = flattenBlocks(blocks).filter((block) => block.content !== null);
  if (position === "end") {
    const last = text[text.length - 1] ?? blocks[blocks.length - 1]!;
    return { blockId: last.id, offset: blockTextLength(last) };
  }
  return { blockId: (text[0] ?? blocks[0]!).id, offset: 0 };
}
