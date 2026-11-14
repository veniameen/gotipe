import { findBlockInTree } from "../../document/tree";
import { GoTipeError } from "../../error";
import type { Mark } from "../../types/block";
import type { GoTipeEditor } from "../../types/editor";
import type { BlockView } from "../../types/view";

/** The text of the rich-text block that holds a collapsed caret, as input rules see it. */
export interface CaretText {
  block: BlockView;
  text: string;
  caret: number;
}

export function caretText(editor: GoTipeEditor): CaretText | null {
  const { selection, blocks } = editor.getViewState();
  const { anchor, head } = selection;
  if (selection.type !== "text" || anchor.blockId !== head.blockId || anchor.offset !== head.offset)
    return null;
  const block = findBlockInTree(blocks, anchor.blockId);
  if (!block || !Array.isArray(block.content)) return null;
  const text = block.content.map((span) => span.text).join("");
  return anchor.offset <= text.length ? { block, text, caret: anchor.offset } : null;
}

const isAtomic = (mark: { atomic?: boolean }) => mark.atomic === true;

/** Whether any character of `[from, to)` carries `type`, or an atomic mark when `type` is null. */
export function markedIn(block: BlockView, from: number, to: number, type: string | null): boolean {
  if (!Array.isArray(block.content)) return false;
  let end = 0;
  for (const span of block.content) {
    const start = end;
    end += span.text.length;
    if (end <= from || start >= to) continue;
    if (span.marks.some((mark) => (type === null ? isAtomic(mark) : mark.type === type)))
      return true;
  }
  return false;
}

/** Marks of the character at `offset`, without atomic marks. */
function marksAt(block: BlockView, offset: number): Mark[] {
  if (!Array.isArray(block.content)) return [];
  let end = 0;
  for (const span of block.content) {
    end += span.text.length;
    if (offset < end)
      return span.marks
        .filter((mark) => !isAtomic(mark))
        .map((mark) => ({ type: mark.type, attrs: structuredClone(mark.attrs) }) as Mark);
  }
  return [];
}

/**
 * Replaces `[from, to)` before the caret with `insert`, keeping the marks of the replaced text,
 * as its own transaction: one Undo brings back what was typed. Inline code and atomic elements
 * are left alone; a block that refuses the change keeps its text.
 */
export function replaceBeforeCaret(
  editor: GoTipeEditor,
  { block, caret }: CaretText,
  from: number,
  to: number,
  insert: string,
): boolean {
  if (markedIn(block, from, caret, "code") || markedIn(block, from, to, null)) return false;
  try {
    return editor.dispatch({
      steps: [
        { type: "deleteText", blockId: block.id, from, to },
        {
          type: "insertText",
          blockId: block.id,
          offset: from,
          text: insert,
          marks: marksAt(block, from),
        },
      ],
      selection: { type: "cursor", blockId: block.id, offset: caret - (to - from) + insert.length },
    });
  } catch (error) {
    if (error instanceof GoTipeError && error.code === "VALIDATION_ERROR") return false;
    throw error;
  }
}
