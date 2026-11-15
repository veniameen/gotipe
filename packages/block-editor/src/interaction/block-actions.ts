import type { BlockView, GoTipeEditor } from "@gotipe/core";

/**
 * What the block menu does to the block of its handle: on a list row, that row and its nested
 * rows, never the whole list. Each action is one transaction, so one Undo takes it back.
 */

const LISTS = new Set(["bulletList", "orderedList", "todoList"]);

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

/** The block with its children. A list's only row takes the emptied list with it. */
export function deleteMenuBlock(editor: GoTipeEditor, blockId: string): boolean {
  const place = locate(editor.getViewState().blocks, blockId);
  if (!place) return false;
  const { parent } = place;
  const last = !!parent && LISTS.has(parent.type) && parent.children.length === 1;
  return editor
    .chain()
    .deleteBlock(last ? parent.id : blockId)
    .run();
}

/** A copy right after the block, with its children and new IDs: a row stays in its list. */
export function duplicateMenuBlock(editor: GoTipeEditor, blockId: string): boolean {
  if (!locate(editor.getViewState().blocks, blockId)) return false;
  return editor.chain().duplicateBlock(blockId).run();
}

/**
 * The block as plain text: a paragraph whose text has no marks — no bold, colour or link. Inline
 * atoms (mentions, formulas, custom emoji, inline images) are content, not formatting, and stay.
 * A list row leaves its list as the paragraph, as Turn into → Text does. The caret goes to
 * `offset`, by default the end of the text.
 */
export function resetMenuBlock(editor: GoTipeEditor, blockId: string, offset?: number): boolean {
  const place = locate(editor.getViewState().blocks, blockId);
  if (!place) return false;
  const length = textLength(place.block);
  const caret = Math.max(0, Math.min(offset ?? length, length));
  const spans = Array.isArray(place.block.content) ? place.block.content : [];
  const marks = new Set(
    spans.flatMap((span) => span.marks.filter((mark) => !mark.atomic).map((mark) => mark.type)),
  );
  // `setBlockType` keeps the block's ID, so the marks are removed from the paragraph it becomes.
  const chain = editor
    .chain()
    .setSelection({ type: "cursor", blockId, offset: caret })
    .setBlockType("paragraph")
    .setSelection({ type: "cursor", blockId, offset: 0 });
  for (const mark of marks) chain.removeMark(mark, 0, length);
  return chain.setSelection({ type: "cursor", blockId, offset: caret }).run();
}
