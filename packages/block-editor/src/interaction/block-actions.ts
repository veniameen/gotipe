import { type BlockView, type GoTipeEditor, type Step, createId } from "@gotipe/core";

/**
 * What the block menu does to the block of its handle: on a list row, that row and its nested
 * rows, never the whole list. Each action is one transaction, so one Undo takes it back.
 */

const LISTS = new Set(["bulletList", "orderedList", "todoList"]);
const ROWS = new Set(["listItem", "todoItem"]);

interface Place {
  block: BlockView;
  parent: BlockView | null;
}

function locate(blocks: BlockView[], id: string, parent: BlockView | null = null): Place | null {
  for (const block of blocks) {
    if (block.id === id) return { block, parent };
    const inner = locate(block.children, id, block);
    if (inner) return inner;
  }
  return null;
}

const textLength = (block: BlockView) =>
  Array.isArray(block.content)
    ? block.content.reduce((sum, span) => sum + span.text.length, 0)
    : typeof block.content === "string"
      ? block.content.length
      : 0;

/**
 * The step that keeps a column from being left without blocks when `removedId`, its only child,
 * goes: an empty paragraph to type in takes its place. `null` when no column would be emptied.
 */
export function refillColumn(
  blocks: BlockView[],
  removedId: string,
): { step: Step; paragraphId: string } | null {
  const parent = locate(blocks, removedId)?.parent;
  if (parent?.type !== "column" || parent.children.length !== 1) return null;
  const paragraphId = createId();
  return {
    paragraphId,
    step: {
      type: "insertBlock",
      parentId: parent.id,
      index: 0,
      block: { id: paragraphId, type: "paragraph", attrs: {}, content: [], children: [] },
    },
  };
}

/**
 * The block with its children. A list's only row takes the emptied list with it; a column left
 * without blocks gets an empty paragraph, which takes the caret if it was in what went away.
 */
export function deleteMenuBlock(editor: GoTipeEditor, blockId: string): boolean {
  const { blocks, selection } = editor.getViewState();
  const place = locate(blocks, blockId);
  if (!place) return false;
  const { parent } = place;
  const target =
    parent && LISTS.has(parent.type) && parent.children.length === 1 ? parent : place.block;
  const refill = refillColumn(blocks, target.id);
  if (!refill) return editor.chain().deleteBlock(target.id).run();
  const inside = [selection.anchor, selection.head].some((end) => !!locate([target], end.blockId));
  return editor.dispatch({
    steps: [{ type: "deleteBlock", blockId: target.id }, refill.step],
    ...(inside ? { selection: { type: "cursor", blockId: refill.paragraphId, offset: 0 } } : {}),
  });
}

/** A copy right after the block, with its children and new IDs: a row stays in its list. */
export function duplicateMenuBlock(editor: GoTipeEditor, blockId: string): boolean {
  if (!locate(editor.getViewState().blocks, blockId)) return false;
  return editor.chain().duplicateBlock(blockId).run();
}

/**
 * The block as plain text: a paragraph whose text has no marks — no bold, colour or link. Inline
 * atoms (mentions, formulas, custom emoji, inline images) are content, not formatting, and stay.
 * A list row leaves its list as the paragraph, as Turn into → Text does. A paragraph holds no
 * children, so another block with children (a toggle, a callout) keeps its type and loses only
 * the marks; a block without text of its own (an image, a divider, a table) is left as it is.
 * The caret goes to `offset`, by default the end of the text. False when nothing changes.
 */
export function resetMenuBlock(editor: GoTipeEditor, blockId: string, offset?: number): boolean {
  const place = locate(editor.getViewState().blocks, blockId);
  if (!place || place.block.content === null) return false;
  const { block } = place;
  const length = textLength(block);
  const caret = Math.max(0, Math.min(offset ?? length, length));
  const spans = Array.isArray(block.content) ? block.content : [];
  const marks = new Set(
    spans.flatMap((span) => span.marks.filter((mark) => !mark.atomic).map((mark) => mark.type)),
  );
  const retype = ROWS.has(block.type) || block.children.length === 0;
  if (!retype && marks.size === 0) return false;
  const chain = editor.chain().setSelection({ type: "cursor", blockId, offset: caret });
  // `setBlockType` keeps the block's ID, so the marks are removed from the paragraph it becomes.
  if (retype) chain.setBlockType("paragraph");
  chain.setSelection({ type: "cursor", blockId, offset: 0 });
  for (const mark of marks) chain.removeMark(mark, 0, length);
  return chain.setSelection({ type: "cursor", blockId, offset: caret }).run();
}
