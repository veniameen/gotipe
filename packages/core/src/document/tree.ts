import type { ViewState } from "../types/view";

// ---- Marks position helpers ----

export function findBlockInTree(
  blocks: ViewState["blocks"],
  blockId: string,
): ViewState["blocks"][0] | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.children.length > 0) {
      const found = findBlockInTree(block.children, blockId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Get marks at a cursor position by inheriting from the character to the LEFT.
 * At offset 0 (start of block), returns [] since there's nothing to the left.
 * This matches standard rich text editor behavior (ProseMirror, Notion, etc.)
 * Atomic marks (MarkView.atomic) are never inherited: text typed beside an atom is not
 * part of it (docs/development/inline-atoms.md).
 */
export function getMarksAt(
  blocks: ViewState["blocks"],
  blockId: string,
  offset: number,
  inherit = true,
): { type: string; attrs: Record<string, unknown> }[] {
  const block = findBlockInTree(blocks, blockId);
  if (!block || !Array.isArray(block.content) || block.content.length === 0) return [];

  const charIndex = inherit ? offset - 1 : offset;
  if (charIndex < 0) return [];

  let pos = 0;
  for (const span of block.content) {
    const spanEnd = pos + span.text.length;
    if (charIndex >= pos && charIndex < spanEnd) {
      return span.marks
        .filter((m) => !m.atomic)
        .map((m) => ({ type: m.type, attrs: m.attrs ?? {} }));
    }
    pos = spanEnd;
  }

  return [];
}

// ---- Block tree navigation helpers ----

/** Check if a block has empty/no text content */
export function isBlockEmpty(block: ViewState["blocks"][0]): boolean {
  const normalizedLength = (text: string): number =>
    text.replace(/\s|\u200B|\u200C|\u200D|\uFEFF/g, "").length;

  if (block.content === null) return true;
  if (Array.isArray(block.content)) {
    return block.content.length === 0 || block.content.every((s) => normalizedLength(s.text) === 0);
  }
  if (typeof block.content === "string") return normalizedLength(block.content) === 0;
  return true;
}

/** Find a block's parent in the tree */
export function findParentBlock(
  blocks: ViewState["blocks"],
  childId: string,
): { parent: ViewState["blocks"][0]; index: number } | null {
  for (const b of blocks) {
    for (let i = 0; i < b.children.length; i++) {
      if (b.children[i]!.id === childId) return { parent: b, index: i };
    }
    const found = findParentBlock(b.children, childId);
    if (found) return found;
  }
  return null;
}

/** Find a block's location (parent array + index) */
export function findBlockLocation(
  blocks: ViewState["blocks"],
  id: string,
  parentId: string | null = null,
): { parentId: string | null; index: number } | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.id === id) return { parentId, index: i };
    const found = findBlockLocation(blocks[i]!.children, id, blocks[i]!.id);
    if (found) return found;
  }
  return null;
}

/** Find the next sibling after a block (split result) in the tree */
export function findBlockAndSibling(
  blocks: ViewState["blocks"],
  blockId: string,
): { id: string } | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.id === blockId) {
      const next = blocks[i + 1];
      return next ? { id: next.id } : null;
    }
    const found = findBlockAndSibling(blocks[i]!.children, blockId);
    if (found) return found;
  }
  return null;
}

/** Find the previous sibling before a block in the tree */
export function findBlockAndPreviousSibling(
  blocks: ViewState["blocks"],
  blockId: string,
): { id: string } | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.id === blockId) {
      const prev = blocks[i - 1];
      return prev ? { id: prev.id } : null;
    }
    const found = findBlockAndPreviousSibling(blocks[i]!.children, blockId);
    if (found) return found;
  }
  return null;
}

export const LIST_CONTAINER_TYPES = new Set(["bulletList", "orderedList", "todoList"]);
export const ENTER_EXITS_TO_PARAGRAPH_TYPES = new Set(["heading", "blockquote", "callout"]);

export function findFirstSelectableBlock(
  blocks: ViewState["blocks"],
): ViewState["blocks"][number] | null {
  for (const block of blocks) {
    if (LIST_CONTAINER_TYPES.has(block.type) && block.children.length > 0) {
      const nested = findFirstSelectableBlock(block.children);
      if (nested) return nested;
    }
    return block;
  }
  return null;
}

export function blockTextLength(block: ViewState["blocks"][number]): number {
  if (Array.isArray(block.content)) return block.content.reduce((n, s) => n + s.text.length, 0);
  if (typeof block.content === "string") return block.content.length;
  return 0;
}

export function flattenBlocks(
  blocks: ViewState["blocks"],
  out: ViewState["blocks"] = [],
): ViewState["blocks"] {
  for (const block of blocks) {
    out.push(block);
    if (block.children.length > 0) flattenBlocks(block.children, out);
  }
  return out;
}

/**
 * Maps a selection from one document to another after an external replacement:
 * by block id when it survived, otherwise by the position of the block in
 * document order; offsets are clamped to the new text.
 */
export function mapSelectionToDocument(
  selection: {
    type?: ViewState["selection"]["type"];
    blockIds?: string[];
    anchor: { blockId: string; offset: number };
    head: { blockId: string; offset: number };
  },
  previous: ViewState["blocks"],
  next: ViewState["blocks"],
): ViewState["selection"] | null {
  const prevFlat = flattenBlocks(previous);
  const nextFlat = flattenBlocks(next);
  if (nextFlat.length === 0) return null;
  const nextById = new Map(nextFlat.map((b) => [b.id, b] as const));
  const mapPoint = (point: { blockId: string; offset: number }) => {
    let target = nextById.get(point.blockId);
    if (!target) {
      const index = prevFlat.findIndex((b) => b.id === point.blockId);
      target = nextFlat[Math.min(Math.max(index, 0), nextFlat.length - 1)];
    }
    if (!target) return null;
    return { blockId: target.id, offset: Math.min(point.offset, blockTextLength(target)) };
  };
  const anchor = mapPoint(selection.anchor);
  const head = mapPoint(selection.head);
  if (!anchor || !head) return null;
  const blockIds = selection.blockIds?.filter((id) => nextById.has(id));
  const type =
    selection.type === "multi" && !blockIds?.length ? "text" : (selection.type ?? "text");
  return { type, anchor, head, ...(type === "multi" ? { blockIds } : {}) };
}
