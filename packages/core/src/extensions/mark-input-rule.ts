import { findBlockInTree } from "../document/tree";
import { GoTipeError } from "../error";
import type { InputRule } from "../types/extension";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Markdown-style inline formatting as you type: when the closing `delimiter` is typed right
 * before the caret, `delimiter text delimiter` becomes `text` with the mark, and the next typed
 * text is unformatted. The opening delimiter must start a word — at the start of the block or
 * after a character that is not a letter, digit, `_` or the delimiter — so `2*3*` stays text.
 * The change is its own transaction: one undo brings back the typed delimiters.
 */
export function markInputRule(markType: string, delimiter: string): InputRule {
  const fence = escape(delimiter);
  const char = escape(delimiter[0]!);
  const source = `(^|[^\\p{L}\\p{N}_${char}])${fence}([^${char}\\s](?:[^${char}]*[^${char}\\s])?)${fence}`;
  const atCaret = new RegExp(`${source}$`, "u");
  return {
    // The block text has such a run somewhere; the handler checks that it ends at the caret.
    pattern: new RegExp(source, "u"),
    handler(editor) {
      const { selection, blocks } = editor.getViewState();
      const { anchor, head } = selection;
      if (selection.type !== "text" || anchor.blockId !== head.blockId) return false;
      if (anchor.offset !== head.offset) return false;
      const block = findBlockInTree(blocks, anchor.blockId);
      if (!block || !Array.isArray(block.content)) return false;
      const before = block.content
        .map((span) => span.text)
        .join("")
        .slice(0, anchor.offset);
      const match = atCaret.exec(before);
      if (!match) return false;
      const blockId = anchor.blockId;
      const from = match.index + match[1]!.length;
      const to = from + match[2]!.length;
      let applied: boolean;
      try {
        applied = editor.dispatch({
          steps: [
            {
              type: "deleteText",
              blockId,
              from: anchor.offset - delimiter.length,
              to: anchor.offset,
            },
            { type: "deleteText", blockId, from, to: from + delimiter.length },
            { type: "addMark", blockId, from, to, mark: { type: markType, attrs: {} } },
          ],
          selection: { type: "cursor", blockId, offset: to },
        });
      } catch (error) {
        // A block whose text does not take this mark keeps the typed delimiters.
        if (error instanceof GoTipeError && error.code === "VALIDATION_ERROR") return false;
        throw error;
      }
      // A transaction filter that cancels the change leaves the input to the next rules.
      if (!applied) return false;
      editor.chain().unsetMark(markType).run();
      return true;
    },
  };
}
