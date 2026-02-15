import type { GoTipeEditor } from "@gotipe/core";
import { Editor } from "@gotipe/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiCommandBar } from "./ai-command-bar";
import { AiStatusIndicator } from "./ai-status-indicator";
import { BlockToolbar } from "./block-toolbar";
import { BlockEditorBubbleMenu } from "./bubble-menu";
import type { RemotePeer } from "./collaboration-cursors";
import { CollaborationCursors } from "./collaboration-cursors";
import { GhostText } from "./ghost-text";
import { SlashMenu } from "./slash-menu";
import type { Suggestion } from "./suggestion-toolbar";
import { SuggestionToolbar } from "./suggestion-toolbar";
import { ThemeToggle } from "./theme-toggle";

const BLOCK_TOOLBAR_WIDTH = 36;
const BLOCK_TOOLBAR_GAP = 8;
const BLOCK_TOOLBAR_COLUMN_OFFSET = 45;
const TOOLBAR_HIDE_DELAY_MS = 20;
const TOOLBAR_HOVER_X_MIN_OFFSET = 120;
const TOOLBAR_HOVER_X_MAX_OFFSET = 560;
const LIST_CONTAINER_TYPES = new Set(["bulletList", "orderedList", "todoList"]);
const LIST_ITEM_TYPES = new Set(["listItem", "todoItem"]);
const ROW_DRAGGABLE_LIST_TYPES = new Set(["bulletList", "orderedList", "todoList"]);

type ViewBlock = ReturnType<GoTipeEditor["getViewState"]>["blocks"][number];
type DropTarget = { parentId: string | null; index: number };
type BlockLocation = {
  parentId: string | null;
  parentType: string | null;
  index: number;
  blockType: string;
};

export interface BlockEditorProps {
  editor: GoTipeEditor | null;
  className?: string;
  style?: React.CSSProperties;
  showSlashMenu?: boolean;
  showBlockToolbar?: boolean;
  showBubbleMenu?: boolean;
  showCollaborationCursors?: boolean;
  remotePeers?: RemotePeer[];
  showAiCommandBar?: boolean;
  showThemeToggle?: boolean;
  suggestions?: Suggestion[];
  onAiCommand?: (prompt: string) => void;
  onSuggestionAccept?: (suggestion: Suggestion) => void;
  onSuggestionReject?: (suggestion: Suggestion) => void;
  onSuggestionAcceptAll?: () => void;
  onSuggestionRejectAll?: () => void;
  children?: React.ReactNode;
}

/**
 * Walk up from `el` to find the top-level block element
 * (a direct child of [data-gotipe-content] that has data-block-id).
 */
function getTopLevelBlockId(el: HTMLElement | null, containerEl: HTMLElement): string | null {
  const contentEl = containerEl.querySelector("[data-gotipe-content]");
  if (!contentEl) return null;
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
function getTopLevelBlockEls(containerEl: HTMLElement): HTMLElement[] {
  const contentEl = containerEl.querySelector("[data-gotipe-content]");
  if (!contentEl) return [];
  return Array.from(contentEl.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute("data-block-id"),
  );
}

function getTopLevelBlockIdAtPoint(
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

function getBlockElById(containerEl: HTMLElement, blockId: string): HTMLElement | null {
  return containerEl.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
}

function getTopLevelAncestorBlockId(containerEl: HTMLElement, blockId: string): string | null {
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

function findNearestRowInList(listEl: HTMLElement, clientY: number): string | null {
  const rows = Array.from(
    listEl.querySelectorAll('[data-block-type="listItem"], [data-block-type="todoItem"]'),
  ).filter((el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute("data-block-id"));
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

function getRowAnchorBlockIdAtPoint(
  containerEl: HTMLElement,
  clientX: number,
  clientY: number,
): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  let listContainerId: string | null = null;

  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue;
    const blockEl = node.closest("[data-block-id]") as HTMLElement | null;
    if (!blockEl || !containerEl.contains(blockEl)) continue;

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

function getToolbarRailLeft(containerEl: HTMLElement): number {
  const contentEl = containerEl.querySelector("[data-gotipe-content]") as HTMLElement | null;
  const containerRect = containerEl.getBoundingClientRect();
  const contentRect = contentEl?.getBoundingClientRect() ?? containerRect;
  const topLevelBlocks = getTopLevelBlockEls(containerEl);
  const columnLeftCandidates = topLevelBlocks
    .filter((blockEl) => (blockEl.getAttribute("data-block-type") ?? "") !== "divider")
    .map((blockEl) => blockEl.getBoundingClientRect().left);
  const columnLeft =
    columnLeftCandidates.length > 0
      ? Math.min(...columnLeftCandidates)
      : contentRect.left;

  return Math.max(
    0,
    Math.round(columnLeft - containerRect.left - BLOCK_TOOLBAR_COLUMN_OFFSET),
  );
}

function getBlockTextLeft(blockEl: HTMLElement): number {
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const text = n.textContent ?? "";
    if (!text.trim()) continue;
    const r = document.createRange();
    r.setStart(n, 0);
    r.setEnd(n, Math.min(1, text.length));
    const rr = r.getBoundingClientRect();
    if (rr.width > 0 || rr.height > 0) return rr.left;
  }

  const host =
    (blockEl.querySelector("[data-gotipe-todo-content]") as HTMLElement | null) ??
    (blockEl.querySelector("[contenteditable='true']") as HTMLElement | null) ??
    blockEl;
  return host.getBoundingClientRect().left;
}

function findBlockLocation(
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

function findBlockById(
  blocks: ViewBlock[],
  blockId: string,
): ViewBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    const nested = findBlockById(block.children, blockId);
    if (nested) return nested;
  }
  return null;
}

function getChildBlockEls(containerEl: HTMLElement, parentId: string | null): HTMLElement[] {
  if (!parentId) return getTopLevelBlockEls(containerEl);
  const parentEl = getBlockElById(containerEl, parentId);
  if (!parentEl) return [];
  return Array.from(parentEl.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute("data-block-id"),
  );
}

function getDropIndexForParent(
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

function getDropIndicatorYForParent(
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

function getDropIndicatorHorizontalInsets(
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

function canDropListItemIntoParent(itemType: string, parentType: string | null): boolean {
  if (!parentType) return false;
  if (itemType === "todoItem") return parentType === "todoList";
  if (itemType === "listItem") return parentType === "bulletList" || parentType === "orderedList";
  return false;
}

function inferListContainerTypeForItem(
  itemType: string,
  sourceParentType: string | null,
): "bulletList" | "orderedList" | "todoList" {
  if (itemType === "todoItem") return "todoList";
  if (sourceParentType === "orderedList") return "orderedList";
  return "bulletList";
}

function resolveListRowDropTarget(
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

export function BlockEditor({
  editor,
  className,
  style,
  showSlashMenu = true,
  showBlockToolbar = true,
  showBubbleMenu = true,
  showAiCommandBar = true,
  showThemeToggle = false,
  remotePeers,
  suggestions,
  onAiCommand,
  onSuggestionAccept,
  onSuggestionReject,
  onSuggestionAcceptAll,
  onSuggestionRejectAll,
  children,
}: BlockEditorProps) {
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [draggingBlockType, setDraggingBlockType] = useState<string | null>(null);
  const [draggingParentId, setDraggingParentId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [hoveredToolbarTarget, setHoveredToolbarTarget] = useState<{
    actionBlockId: string;
    anchorBlockId: string;
    addBlockId: string;
    dragBlockId: string;
  } | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideToolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingBlockIdRef = useRef<string | null>(null);
  const draggingBlockTypeRef = useRef<string | null>(null);
  const draggingParentIdRef = useRef<string | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);

  const clearHideToolbarTimer = useCallback(() => {
    if (hideToolbarTimerRef.current) {
      clearTimeout(hideToolbarTimerRef.current);
      hideToolbarTimerRef.current = null;
    }
  }, []);

  const hideToolbarNow = useCallback(() => {
    setHoveredToolbarTarget(null);
    setToolbarPos(null);
  }, []);

  const scheduleHideToolbar = useCallback(() => {
    clearHideToolbarTimer();
    hideToolbarTimerRef.current = setTimeout(() => {
      hideToolbarTimerRef.current = null;
      hideToolbarNow();
    }, TOOLBAR_HIDE_DELAY_MS);
  }, [clearHideToolbarTimer, hideToolbarNow]);

  useEffect(() => () => clearHideToolbarTimer(), [clearHideToolbarTimer]);

  // Track hovered block for floating toolbar
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingBlockId) {
        clearHideToolbarTimer();
        return;
      }

      // Don't reset when hovering over the toolbar or context menu
      const target = e.target as HTMLElement;
      if (
        target.closest(".gotipe-block-toolbar") ||
        target.closest(".gotipe-block-toolbar-wrapper") ||
        target.closest(".gotipe-block-context-menu")
      ) {
        clearHideToolbarTimer();
        return;
      }

      if (!containerRef.current) return;
      const anchorBlockId = getRowAnchorBlockIdAtPoint(containerRef.current, e.clientX, e.clientY);
      if (!anchorBlockId) {
        scheduleHideToolbar();
        return;
      }
      const actionBlockId =
        getTopLevelAncestorBlockId(containerRef.current, anchorBlockId) ?? anchorBlockId;
      clearHideToolbarTimer();

      const anchorEl = getBlockElById(containerRef.current, anchorBlockId);
      if (!anchorEl) return;
      const anchorType = anchorEl.getAttribute("data-block-type") ?? "";
      const addBlockId =
        anchorType === "listItem" || anchorType === "todoItem"
          ? anchorBlockId
          : actionBlockId;
      const dragBlockId =
        anchorType === "listItem" || anchorType === "todoItem"
          ? anchorBlockId
          : actionBlockId;
      const textLeft = getBlockTextLeft(anchorEl);
      const inGutterEnvelope =
        e.clientX >= textLeft - TOOLBAR_HOVER_X_MIN_OFFSET &&
        e.clientX <= textLeft + TOOLBAR_HOVER_X_MAX_OFFSET;
      if (!inGutterEnvelope) {
        scheduleHideToolbar();
        return;
      }

      const targetChanged =
        hoveredToolbarTarget?.anchorBlockId !== anchorBlockId ||
        hoveredToolbarTarget?.actionBlockId !== actionBlockId ||
        hoveredToolbarTarget?.addBlockId !== addBlockId ||
        hoveredToolbarTarget?.dragBlockId !== dragBlockId;
      if (!targetChanged) return;

      setHoveredToolbarTarget({ actionBlockId, anchorBlockId, addBlockId, dragBlockId });
      if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const anchorRect = anchorEl.getBoundingClientRect();
        const left = getToolbarRailLeft(containerRef.current);
        setToolbarPos({
          top: Math.round(anchorRect.top - containerRect.top),
          left,
        });
      }
    },
    [clearHideToolbarTimer, draggingBlockId, hoveredToolbarTarget, scheduleHideToolbar],
  );

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Don't hide if mouse moves to toolbar (which is a child of the container)
    const related = e.relatedTarget as HTMLElement | null;
    if (
      related &&
      (related.closest?.(".gotipe-block-toolbar") ||
        related.closest?.(".gotipe-block-toolbar-wrapper") ||
        related.closest?.(".gotipe-block-context-menu"))
    ) {
      clearHideToolbarTimer();
      return;
    }
    scheduleHideToolbar();
  }, [clearHideToolbarTimer, scheduleHideToolbar]);

  const handleBlockDragStart = useCallback((blockId: string) => {
    if (!editor) return;
    clearHideToolbarTimer();
    const location = findBlockLocation(editor.getViewState().blocks, blockId);
    const canDragAsRow =
      !!location?.parentId &&
      (location.blockType === "listItem" || location.blockType === "todoItem") &&
      !!location.parentType &&
      ROW_DRAGGABLE_LIST_TYPES.has(location.parentType);
    const parentId = canDragAsRow ? location.parentId : null;

    draggingBlockIdRef.current = blockId;
    draggingBlockTypeRef.current = location?.blockType ?? null;
    draggingParentIdRef.current = parentId;
    setDraggingBlockId(blockId);
    setDraggingBlockType(location?.blockType ?? null);
    setDraggingParentId(parentId);
    dropTargetRef.current = null;
    setDropTarget(null);
  }, [clearHideToolbarTimer, editor]);

  const handleBlockDragEnd = useCallback(() => {
    clearHideToolbarTimer();
    draggingBlockIdRef.current = null;
    draggingBlockTypeRef.current = null;
    draggingParentIdRef.current = null;
    dropTargetRef.current = null;
    setDraggingBlockId(null);
    setDraggingBlockType(null);
    setDraggingParentId(null);
    setDropTarget(null);
  }, [clearHideToolbarTimer]);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
    const activeDragBlockId = draggingBlockIdRef.current ?? draggingBlockId;
    if (!activeDragBlockId || !containerRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const activeDragBlockType = draggingBlockTypeRef.current ?? draggingBlockType;
    const blocks = editor?.getViewState().blocks ?? [];
    const nextTarget =
      activeDragBlockType && LIST_ITEM_TYPES.has(activeDragBlockType)
        ? resolveListRowDropTarget(
          containerRef.current,
          blocks,
          activeDragBlockType,
          e.clientX,
          e.clientY,
        )
        : (() => {
          const parentId = draggingParentIdRef.current ?? draggingParentId;
          const idx = getDropIndexForParent(containerRef.current!, parentId, e.clientY);
          return { parentId, index: idx };
        })();
    const prevTarget = dropTargetRef.current;
    if (
      prevTarget?.parentId !== nextTarget.parentId ||
      prevTarget?.index !== nextTarget.index
    ) {
      dropTargetRef.current = nextTarget;
      setDropTarget(nextTarget);
    }
  },
  [draggingBlockId, draggingBlockType, draggingParentId, editor],
);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const blockId =
        e.dataTransfer.getData("text/gotipe-block-id") ||
        draggingBlockIdRef.current ||
        draggingBlockId;
      if (!blockId || !editor) {
        draggingBlockIdRef.current = null;
        draggingBlockTypeRef.current = null;
        draggingParentIdRef.current = null;
        dropTargetRef.current = null;
        setDraggingBlockId(null);
        setDraggingBlockType(null);
        setDraggingParentId(null);
        setDropTarget(null);
        return;
      }

      const blocks = editor.getViewState().blocks;
      const currentLocation = findBlockLocation(blocks, blockId);
      if (!currentLocation) {
        draggingBlockIdRef.current = null;
        draggingBlockTypeRef.current = null;
        draggingParentIdRef.current = null;
        dropTargetRef.current = null;
        setDraggingBlockId(null);
        setDraggingBlockType(null);
        setDraggingParentId(null);
        setDropTarget(null);
        return;
      }

      const fallbackParentId = draggingParentIdRef.current ?? draggingParentId;
      const fallbackIndex =
        containerRef.current
          ? getDropIndexForParent(containerRef.current, fallbackParentId, e.clientY)
          : currentLocation.index;
      const target = dropTarget ?? { parentId: fallbackParentId, index: fallbackIndex };
      const targetParentId = target.parentId;

      let adjustedTarget = target.index;
      if (
        targetParentId === currentLocation.parentId &&
        adjustedTarget > currentLocation.index
      ) {
        adjustedTarget -= 1;
      }

      const locationChanged =
        targetParentId !== currentLocation.parentId ||
        adjustedTarget !== currentLocation.index;

      if (locationChanged) {
        const draggingType = draggingBlockTypeRef.current ?? draggingBlockType ?? currentLocation.blockType;

        if (
          LIST_ITEM_TYPES.has(draggingType) &&
          targetParentId === null
        ) {
          const sourceParentId = currentLocation.parentId;
          const sourceParentType = currentLocation.parentType;
          const listContainerType = inferListContainerTypeForItem(draggingType, sourceParentType);
          const newListId = crypto.randomUUID();
          editor.dispatch({
            steps: [
              {
                type: "insertBlock",
                parentId: null,
                index: adjustedTarget,
                block: {
                  id: newListId,
                  type: listContainerType,
                  attrs: {},
                  content: null,
                  children: [],
                },
              },
              {
                type: "moveBlock",
                blockId,
                newParentId: newListId,
                newIndex: 0,
              },
            ],
          });

          if (sourceParentId) {
            const nextState = editor.getViewState();
            const sourceParent = findBlockById(nextState.blocks, sourceParentId);
            if (
              sourceParent &&
              LIST_CONTAINER_TYPES.has(sourceParent.type) &&
              sourceParent.children.length === 0
            ) {
              editor.dispatch({
                steps: [{ type: "deleteBlock", blockId: sourceParentId }],
              });
            }
          }
        } else {
          editor.dispatch({
            steps: [
              {
                type: "moveBlock",
                blockId,
                newParentId: targetParentId,
                newIndex: adjustedTarget,
              },
            ],
          });
        }
      }

      draggingBlockIdRef.current = null;
      draggingBlockTypeRef.current = null;
      draggingParentIdRef.current = null;
      dropTargetRef.current = null;
      setDraggingBlockId(null);
      setDraggingBlockType(null);
      setDraggingParentId(null);
      setDropTarget(null);
    },
    [draggingBlockId, draggingBlockType, draggingParentId, dropTarget, editor],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!containerRef.current?.contains(e.relatedTarget as Node)) {
        dropTargetRef.current = null;
        setDropTarget(null);
      }
    },
    [],
  );

  if (!editor) return null;

  const dropIndicatorY =
    dropTarget && containerRef.current
      ? getDropIndicatorYForParent(containerRef.current, dropTarget.parentId, dropTarget.index)
      : null;
  const dropIndicatorInsets =
    dropTarget && containerRef.current
      ? getDropIndicatorHorizontalInsets(containerRef.current, dropTarget.parentId)
      : { left: 0, right: 0 };

  const editorClasses = [
    "gotipe-block-editor",
    showBlockToolbar ? "gotipe-block-editor--with-toolbar" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={containerRef}
      className={editorClasses}
      style={{ ...style, position: "relative" }}
      data-gotipe-block-editor=""
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      onMouseMove={showBlockToolbar ? handleMouseMove : undefined}
      onMouseLeave={showBlockToolbar ? handleMouseLeave : undefined}
    >
      <Editor editor={editor}>
        {showSlashMenu && <SlashMenu editor={editor} commands={editor.getSlashCommands()} />}
        {showBubbleMenu && <BlockEditorBubbleMenu editor={editor} enableAI={showAiCommandBar} />}
        {children}
      </Editor>

      {/* Remote collaboration cursors */}
      {remotePeers && remotePeers.length > 0 && (
        <CollaborationCursors peers={remotePeers} containerRef={containerRef} />
      )}

      {/* Floating block toolbar — positioned in the left padding gutter */}
      {showBlockToolbar && hoveredToolbarTarget && toolbarPos && (
        <div
          className="gotipe-block-toolbar-wrapper"
          style={{
            position: "absolute",
            top: toolbarPos.top,
            left: toolbarPos.left,
            width: BLOCK_TOOLBAR_WIDTH,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
          }}
          onMouseEnter={clearHideToolbarTimer}
          onMouseLeave={(e) => {
            const related = e.relatedTarget as HTMLElement | null;
            if (
              related &&
              (related.closest?.(".gotipe-block-toolbar") ||
                related.closest?.(".gotipe-block-toolbar-wrapper") ||
                related.closest?.(".gotipe-block-context-menu"))
            ) {
              clearHideToolbarTimer();
              return;
            }
            scheduleHideToolbar();
          }}
        >
          <BlockToolbar
            editor={editor}
            blockId={hoveredToolbarTarget.actionBlockId}
            addBlockId={hoveredToolbarTarget.addBlockId}
            dragBlockId={hoveredToolbarTarget.dragBlockId}
            onDragStart={handleBlockDragStart}
            onDragEnd={handleBlockDragEnd}
            openSlashMenuOnAdd={showSlashMenu}
          />
        </div>
      )}

      {/* Drop indicator */}
      {draggingBlockId && dropIndicatorY !== null && (
        <div
          className="gotipe-drop-indicator"
          style={{
            top: dropIndicatorY,
            left: dropIndicatorInsets.left,
            right: dropIndicatorInsets.right,
          }}
        />
      )}

      {/* Suggestion toolbar — shown when AI proofread suggestions exist */}
      {suggestions && suggestions.length > 0 && onSuggestionAccept && onSuggestionReject && (
        <SuggestionToolbar
          editor={editor}
          suggestions={suggestions}
          currentIndex={suggestionIndex}
          onNavigate={setSuggestionIndex}
          onAccept={onSuggestionAccept}
          onReject={onSuggestionReject}
          onAcceptAll={onSuggestionAcceptAll ?? (() => {})}
          onRejectAll={onSuggestionRejectAll ?? (() => {})}
        />
      )}

      {/* Ghost text — AI autocomplete overlay */}
      {showAiCommandBar && <GhostText editor={editor} />}

      {/* AI Command Bar — Mod-k toggled floating input */}
      {showAiCommandBar && (
        <AiCommandBar editor={editor} onSubmit={onAiCommand} />
      )}

      {/* AI Status Indicator — footer bar during AI processing */}
      {showAiCommandBar && <AiStatusIndicator editor={editor} />}

      {/* Theme toggle */}
      {showThemeToggle && (
        <div style={{ position: "absolute", top: 8, right: 8 }}>
          <ThemeToggle />
        </div>
      )}
    </div>
  );
}
