export const LIST_CONTAINER_TYPES = new Set(["bulletList", "orderedList", "todoList"]);
export const LIST_ITEM_TYPES = new Set(["listItem", "todoItem"]);
import type { GoTipeEditor } from "@gotipe/core";

export type SlashTrigger = {
  blockId: string;
  from: number;
  to: number;
  query: string;
};

export type ViewBlock = ReturnType<GoTipeEditor["getViewState"]>["blocks"][number];

export function findBlockById(
  blocks: ReturnType<GoTipeEditor["getViewState"]>["blocks"],
  blockId: string,
): ReturnType<GoTipeEditor["getViewState"]>["blocks"][number] | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.children.length > 0) {
      const nested = findBlockById(block.children, blockId);
      if (nested) return nested;
    }
  }
  return null;
}

function blockContainsId(block: ViewBlock, blockId: string): boolean {
  if (block.id === blockId) return true;
  for (const child of block.children) {
    if (blockContainsId(child, blockId)) return true;
  }
  return false;
}

export function findTopLevelIndexByBlockId(
  blocks: ReturnType<GoTipeEditor["getViewState"]>["blocks"],
  blockId: string,
): number | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blockContainsId(blocks[i]!, blockId)) return i;
  }
  return null;
}

export function resolveCaretBlock(block: ViewBlock): ViewBlock {
  if (LIST_CONTAINER_TYPES.has(block.type) && block.children.length > 0) {
    return resolveCaretBlock(block.children[0]!);
  }
  return block;
}

export function getBlockTextLength(block: ViewBlock): number {
  if (Array.isArray(block.content)) {
    return block.content.reduce((sum, span) => sum + span.text.length, 0);
  }
  if (typeof block.content === "string") {
    return block.content.length;
  }
  return 0;
}

export function getSlashTrigger(editor: GoTipeEditor): SlashTrigger | null {
  const state = editor.getViewState();
  const sel = state.selection;
  if (sel.type !== "text" || !sel.anchor.blockId) return null;
  if (sel.anchor.blockId !== sel.head.blockId || sel.anchor.offset !== sel.head.offset) return null;

  const block = findBlockById(state.blocks, sel.anchor.blockId);
  if (!block || !Array.isArray(block.content)) return null;

  const text = block.content.map((span) => span.text).join("");
  const caret = Math.max(0, Math.min(sel.anchor.offset, text.length));
  const beforeCaret = text.slice(0, caret);
  const slashIdx = beforeCaret.lastIndexOf("/");
  if (slashIdx === -1) return null;

  if (slashIdx > 0 && !/\s/.test(beforeCaret[slashIdx - 1] ?? "")) return null;

  const rawQuery = beforeCaret.slice(slashIdx + 1);
  if (/\s/.test(rawQuery)) return null;

  return {
    blockId: sel.anchor.blockId,
    from: slashIdx,
    to: caret,
    query: rawQuery,
  };
}
