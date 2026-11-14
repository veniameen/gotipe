import { type GoTipeEditor, type Transaction, createId } from "@gotipe/core";
export { getBlockTextLeft, getBlockFirstLineMetrics } from "../interaction/block-text-metrics";

export const LIST_CONTAINER_TYPES = new Set(["bulletList", "orderedList", "todoList"]);
export const LIST_ITEM_TYPES = new Set(["listItem", "todoItem"]);
export const ROW_DRAGGABLE_LIST_TYPES = new Set(["bulletList", "orderedList", "todoList"]);

export type ViewBlock = ReturnType<GoTipeEditor["getViewState"]>["blocks"][number];
export type DropTarget = { parentId: string | null; index: number };
export type BlockLocation = {
  parentId: string | null;
  parentType: string | null;
  index: number;
  blockType: string;
};

/**
 * Walk up from `el` to find the top-level block element
 * (a direct child of [data-gotipe-content] that has data-block-id).
 */
export function getTopLevelBlockId(
  start: HTMLElement | null,
  containerEl: HTMLElement,
): string | null {
  const contentEl = containerEl.querySelector("[data-gotipe-content]");
  if (!contentEl) return null;
  let el = start;
  while (el && el !== containerEl) {
    if (el.parentElement === contentEl && el.hasAttribute("data-block-id")) {
      return el.getAttribute("data-block-id");
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Get top-level block elements (direct children of the content area).
 */
export function getTopLevelBlockEls(containerEl: HTMLElement): HTMLElement[] {
  const contentEl = containerEl.querySelector("[data-gotipe-content]");
  if (!contentEl) return [];
  return Array.from(contentEl.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute("data-block-id"),
  );
}

export function getTopLevelBlockIdAtPoint(
  containerEl: HTMLElement,
  clientX: number,
  clientY: number,
): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue;
    const id = getTopLevelBlockId(node, containerEl);
    if (id) return id;
  }

  const blocks = getTopLevelBlockEls(containerEl);
  let nearest: HTMLElement | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return block.getAttribute("data-block-id");
    }
    const distance = clientY < rect.top ? rect.top - clientY : clientY - rect.bottom;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = block;
    }
  }
  return nearest?.getAttribute("data-block-id") ?? null;
}

export function getBlockElById(containerEl: HTMLElement, blockId: string): HTMLElement | null {
  return containerEl.querySelector(
    `[data-block-id="${CSS.escape(blockId)}"]`,
  ) as HTMLElement | null;
}

export function getTopLevelAncestorBlockId(
  containerEl: HTMLElement,
  blockId: string,
): string | null {
  const contentEl = containerEl.querySelector("[data-gotipe-content]");
  if (!contentEl) return null;
  let blockEl = getBlockElById(containerEl, blockId);
  if (!blockEl) return null;

  while (blockEl && blockEl.parentElement !== contentEl) {
    const parent = blockEl.parentElement?.closest("[data-block-id]") as HTMLElement | null;
    if (!parent) break;
    blockEl = parent;
  }
  return blockEl?.getAttribute("data-block-id") ?? null;
}

export function findNearestRowInList(listEl: HTMLElement, clientY: number): string | null {
  const rows = Array.from(
    listEl.querySelectorAll('[data-block-type="listItem"], [data-block-type="todoItem"]'),
  ).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute("data-block-id"),
  );
  if (rows.length === 0) return null;

  let nearest: HTMLElement | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return row.getAttribute("data-block-id");
    }
    const distance = clientY < rect.top ? rect.top - clientY : clientY - rect.bottom;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = row;
    }
  }
  return nearest?.getAttribute("data-block-id") ?? null;
}

export function getRowAnchorBlockIdAtPoint(
  containerEl: HTMLElement,
  clientX: number,
  clientY: number,
): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  let listContainerId: string | null = null;

  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue;
    let blockEl = node.closest("[data-block-id]") as HTMLElement | null;
    if (!blockEl || !containerEl.contains(blockEl)) continue;
    // A table's handle stays at its first line: its rows carry handles of their own (Atlas, frame 9).
    const table = blockEl.closest('[data-block-type="table"]') as HTMLElement | null;
    if (table && containerEl.contains(table)) blockEl = table;

    const blockType = blockEl.getAttribute("data-block-type") ?? "";
    const blockId = blockEl.getAttribute("data-block-id");
    if (!blockId) continue;

    if (LIST_ITEM_TYPES.has(blockType)) {
      return blockId;
    }
    if (!LIST_CONTAINER_TYPES.has(blockType)) {
      return blockId;
    }
    if (!listContainerId) {
      listContainerId = blockId;
    }
  }

  if (listContainerId) {
    const listEl = getBlockElById(containerEl, listContainerId);
    if (listEl) {
      const rowId = findNearestRowInList(listEl, clientY);
      if (rowId) return rowId;
    }
  }

  // When hovering deep in the left gutter, hit-testing can miss nested list items.
  // Resolve top-level by Y first, then remap list containers to nearest row item.
  const topLevelId = getTopLevelBlockIdAtPoint(containerEl, clientX, clientY);
  if (!topLevelId) return null;
  const topLevelEl = getBlockElById(containerEl, topLevelId);
  const topLevelType = topLevelEl?.getAttribute("data-block-type") ?? "";
  if (LIST_CONTAINER_TYPES.has(topLevelType) && topLevelEl) {
    const rowId = findNearestRowInList(topLevelEl, clientY);
    if (rowId) return rowId;
  }
  return topLevelId;
}

export function getToolbarRailLeft(containerEl: HTMLElement): number {
  const contentEl = containerEl.querySelector("[data-gotipe-content]") as HTMLElement | null;
  const containerRect = containerEl.getBoundingClientRect();
  const contentRect = contentEl?.getBoundingClientRect() ?? containerRect;
  const topLevelBlocks = getTopLevelBlockEls(containerEl);
  const columnLeftCandidates = topLevelBlocks
    .filter((blockEl) => (blockEl.getAttribute("data-block-type") ?? "") !== "divider")
    .map((blockEl) => blockEl.getBoundingClientRect().left);
  const columnLeft =
    columnLeftCandidates.length > 0 ? Math.min(...columnLeftCandidates) : contentRect.left;

  // The handle stands --gt-handle-offset left of the text column; the view and the container
  // width choose the token.
  const offset = Number.parseFloat(
    getComputedStyle(containerEl).getPropertyValue("--gt-handle-offset"),
  );
  return Math.max(
    0,
    Math.round(columnLeft - containerRect.left - (Number.isFinite(offset) ? offset : 0)),
  );
}

export function findBlockLocation(
  blocks: ViewBlock[],
  blockId: string,
  parent: ViewBlock | null = null,
): BlockLocation | null {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (block.id === blockId) {
      return {
        parentId: parent?.id ?? null,
        parentType: parent?.type ?? null,
        index: i,
        blockType: block.type,
      };
    }
    const found = findBlockLocation(block.children, blockId, block);
    if (found) return found;
  }
  return null;
}

export function findBlockById(blocks: ViewBlock[], blockId: string): ViewBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    const nested = findBlockById(block.children, blockId);
    if (nested) return nested;
  }
  return null;
}

export function getChildBlockEls(containerEl: HTMLElement, parentId: string | null): HTMLElement[] {
  if (!parentId) return getTopLevelBlockEls(containerEl);
  const parentEl = getBlockElById(containerEl, parentId);
  if (!parentEl) return [];
  return Array.from(parentEl.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute("data-block-id"),
  );
}

export function getDropIndexForParent(
  containerEl: HTMLElement,
  parentId: string | null,
  clientY: number,
): number {
  const blockEls = getChildBlockEls(containerEl, parentId);
  for (let i = 0; i < blockEls.length; i++) {
    const rect = blockEls[i]!.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY < midY) return i;
  }
  return blockEls.length;
}

export function getDropIndicatorYForParent(
  containerEl: HTMLElement,
  parentId: string | null,
  dropIdx: number,
): number | null {
  const blockEls = getChildBlockEls(containerEl, parentId);
  const containerRect = containerEl.getBoundingClientRect();

  if (blockEls.length === 0) {
    if (!parentId) return null;
    const parentEl = getBlockElById(containerEl, parentId);
    if (!parentEl) return null;
    return parentEl.getBoundingClientRect().top - containerRect.top;
  }

  if (dropIdx <= 0) {
    return blockEls[0]!.getBoundingClientRect().top - containerRect.top;
  }

  if (dropIdx <= blockEls.length) {
    const prevRect = blockEls[dropIdx - 1]!.getBoundingClientRect();
    return prevRect.bottom - containerRect.top;
  }

  return blockEls[blockEls.length - 1]!.getBoundingClientRect().bottom - containerRect.top;
}

export function getDropIndicatorHorizontalInsets(
  containerEl: HTMLElement,
  parentId: string | null,
): { left: number; right: number } {
  if (!parentId) return { left: 0, right: 0 };

  const parentEl = getBlockElById(containerEl, parentId);
  if (!parentEl) return { left: 0, right: 0 };

  const containerRect = containerEl.getBoundingClientRect();
  const parentRect = parentEl.getBoundingClientRect();
  const left = Math.max(0, Math.round(parentRect.left - containerRect.left));
  const right = Math.max(0, Math.round(containerRect.right - parentRect.right));
  return { left, right };
}

export function canDropListItemIntoParent(itemType: string, parentType: string | null): boolean {
  if (!parentType) return false;
  if (itemType === "todoItem") return parentType === "todoList";
  if (itemType === "listItem") return parentType === "bulletList" || parentType === "orderedList";
  return false;
}

export function inferListContainerTypeForItem(
  itemType: string,
  sourceParentType: string | null,
): "bulletList" | "orderedList" | "todoList" {
  if (itemType === "todoItem") return "todoList";
  if (sourceParentType === "orderedList") return "orderedList";
  return "bulletList";
}

export function resolveListRowDropTarget(
  containerEl: HTMLElement,
  blocks: ViewBlock[],
  draggingBlockType: string,
  clientX: number,
  clientY: number,
): DropTarget {
  const anchorBlockId = getRowAnchorBlockIdAtPoint(containerEl, clientX, clientY);
  if (anchorBlockId) {
    const anchorEl = getBlockElById(containerEl, anchorBlockId);
    const anchorType = anchorEl?.getAttribute("data-block-type") ?? null;
    if (canDropListItemIntoParent(draggingBlockType, anchorType)) {
      return {
        parentId: anchorBlockId,
        index: getDropIndexForParent(containerEl, anchorBlockId, clientY),
      };
    }

    const anchorLocation = findBlockLocation(blocks, anchorBlockId);
    if (
      anchorLocation?.parentId &&
      canDropListItemIntoParent(draggingBlockType, anchorLocation.parentType)
    ) {
      return {
        parentId: anchorLocation.parentId,
        index: getDropIndexForParent(containerEl, anchorLocation.parentId, clientY),
      };
    }
  }

  return {
    parentId: null,
    index: getDropIndexForParent(containerEl, null, clientY),
  };
}

/**
 * Moves a dragged block to a gap between siblings. The target index describes
 * the document before removing the source, matching DOM drop hit testing.
 * A list row dropped at the document level keeps a list wrapper.
 */
export function moveDraggedBlock(
  editor: GoTipeEditor,
  blockId: string,
  target: DropTarget,
): boolean {
  if (!editor.isEditable) return false;
  const blocks = editor.getViewState().blocks;
  const currentLocation = findBlockLocation(blocks, blockId);
  const source = findBlockById(blocks, blockId);
  if (!currentLocation || !source) return false;

  const targetParent = target.parentId ? findBlockById(blocks, target.parentId) : null;
  if (target.parentId !== null) {
    if (!targetParent || target.parentId === blockId) return false;
    // Removing the source also removes all of its descendants. Such a target
    // would no longer exist when the engine tries to insert the moved block.
    if (findBlockById(source.children, target.parentId)) return false;
    if (
      LIST_ITEM_TYPES.has(currentLocation.blockType) &&
      !canDropListItemIntoParent(currentLocation.blockType, targetParent.type)
    ) {
      return false;
    }
  }
  const siblings = targetParent?.children ?? blocks;
  if (!Number.isInteger(target.index) || target.index < 0 || target.index > siblings.length) {
    return false;
  }

  let adjustedTarget = target.index;
  if (target.parentId === currentLocation.parentId && adjustedTarget > currentLocation.index) {
    adjustedTarget -= 1;
  }
  if (target.parentId === currentLocation.parentId && adjustedTarget === currentLocation.index) {
    return false;
  }

  const steps: Transaction["steps"] = [];
  if (LIST_ITEM_TYPES.has(currentLocation.blockType) && target.parentId === null) {
    const newListId = createId();
    steps.push(
      {
        type: "insertBlock",
        parentId: null,
        index: adjustedTarget,
        block: {
          id: newListId,
          type: inferListContainerTypeForItem(
            currentLocation.blockType,
            currentLocation.parentType,
          ),
          attrs: {},
          content: null,
          children: [],
        },
      },
      { type: "moveBlock", blockId, newParentId: newListId, newIndex: 0 },
    );
  } else {
    steps.push({
      type: "moveBlock",
      blockId,
      newParentId: target.parentId,
      newIndex: adjustedTarget,
    });
  }
  const sourceParent = currentLocation.parentId
    ? findBlockById(blocks, currentLocation.parentId)
    : null;
  if (
    target.parentId !== currentLocation.parentId &&
    LIST_ITEM_TYPES.has(currentLocation.blockType) &&
    sourceParent &&
    LIST_CONTAINER_TYPES.has(sourceParent.type) &&
    sourceParent.children.length === 1
  ) {
    // Keep moving the last row and removing its empty wrapper in one undo step.
    steps.push({ type: "deleteBlock", blockId: sourceParent.id });
  }
  editor.dispatch({ steps });
  return true;
}
