import type { GoTipeEditor } from "@gotipe/core";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BlockContextMenu } from "./block-context-menu";
import { DragHandle } from "./drag-handle";

type ViewBlock = ReturnType<GoTipeEditor["getViewState"]>["blocks"][number];
type BlockLocation = {
  parentId: string | null;
  parentType: string | null;
  index: number;
};

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
      };
    }
    const nested = findBlockLocation(block.children, blockId, block);
    if (nested) return nested;
  }
  return null;
}

function createInsertedBlock(parentType: string | null, blockId: string) {
  if (parentType === "bulletList" || parentType === "orderedList") {
    return {
      id: blockId,
      type: "listItem",
      attrs: {},
      content: [],
      children: [],
    } as const;
  }
  if (parentType === "todoList") {
    return {
      id: blockId,
      type: "todoItem",
      attrs: { checked: false },
      content: [],
      children: [],
    } as const;
  }
  return {
    id: blockId,
    type: "paragraph",
    attrs: {},
    content: [],
    children: [],
  } as const;
}

export interface BlockToolbarProps {
  editor: GoTipeEditor;
  blockId: string;
  addBlockId?: string;
  dragBlockId?: string;
  onDragStart: (blockId: string) => void;
  onDragEnd: () => void;
  openSlashMenuOnAdd?: boolean;
}

export function BlockToolbar({
  editor,
  blockId,
  addBlockId,
  dragBlockId,
  onDragStart,
  onDragEnd,
  openSlashMenuOnAdd = false,
}: BlockToolbarProps) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [tooltipKind, setTooltipKind] = useState<"add" | "drag">("add");
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const addControlRef = useRef<HTMLDivElement | null>(null);
  const dragControlRef = useRef<HTMLDivElement | null>(null);
  const hideTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTooltipHideTimer = useCallback(() => {
    if (hideTooltipTimerRef.current) {
      clearTimeout(hideTooltipTimerRef.current);
      hideTooltipTimerRef.current = null;
    }
  }, []);

  const updateTooltipPosition = useCallback((kind: "add" | "drag") => {
    const toolbarEl = toolbarRef.current;
    const targetEl = kind === "add" ? addControlRef.current : dragControlRef.current;
    if (!toolbarEl || !targetEl) return;
    const toolbarRect = toolbarEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const nextLeft = targetRect.left - toolbarRect.left + targetRect.width / 2;
    setTooltipLeft(Math.round(nextLeft));
  }, []);

  const showTooltip = useCallback(
    (kind: "add" | "drag") => {
      clearTooltipHideTimer();
      setTooltipKind(kind);
      setTooltipVisible(true);
      requestAnimationFrame(() => updateTooltipPosition(kind));
    },
    [clearTooltipHideTimer, updateTooltipPosition],
  );

  const hideTooltip = useCallback(() => {
    clearTooltipHideTimer();
    setTooltipVisible(false);
  }, [clearTooltipHideTimer]);

  const scheduleHideTooltip = useCallback(() => {
    clearTooltipHideTimer();
    hideTooltipTimerRef.current = setTimeout(() => {
      hideTooltipTimerRef.current = null;
      setTooltipVisible(false);
    }, 90);
  }, [clearTooltipHideTimer]);

  useEffect(() => () => clearTooltipHideTimer(), [clearTooltipHideTimer]);

  useEffect(() => {
    if (!tooltipVisible) return;
    const handleViewportChange = () => updateTooltipPosition(tooltipKind);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [tooltipKind, tooltipVisible, updateTooltipPosition]);

  const handleContextMenuToggle = useCallback(() => {
    hideTooltip();
    setContextMenuOpen((prev) => !prev);
  }, [hideTooltip]);

  const handleAddBlock = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const state = editor.getViewState();
      const insertionTargetId = addBlockId ?? blockId;
      const location = findBlockLocation(state.blocks, insertionTargetId);
      if (!location) return;

      const insertAbove = e.altKey;
      const newBlockId = crypto.randomUUID();
      const newBlock = createInsertedBlock(location.parentType, newBlockId);

      editor.dispatch({
        steps: [
          {
            type: "insertBlock",
            parentId: location.parentId,
            index: location.index + (insertAbove ? 0 : 1),
            block: newBlock,
          },
        ],
      });
      hideTooltip();

      editor.setSelection({
        anchor: { blockId: newBlockId, offset: 0 },
        head: { blockId: newBlockId, offset: 0 },
      });
      editor.focus();

      if (!openSlashMenuOnAdd) return;

      editor.dispatch({
        steps: [
          {
            type: "insertText",
            blockId: newBlockId,
            offset: 0,
            text: "/",
            marks: [],
          },
        ],
      });
      editor.setSelection({
        anchor: { blockId: newBlockId, offset: 1 },
        head: { blockId: newBlockId, offset: 1 },
      });
      editor.focus();
      editor.emit("openSlashMenu");
    },
    [editor, addBlockId, blockId, hideTooltip, openSlashMenuOnAdd],
  );

  const handleCloseMenu = useCallback(() => {
    hideTooltip();
    setContextMenuOpen(false);
  }, [hideTooltip]);

  return (
    <div
      ref={toolbarRef}
      className="gotipe-block-toolbar"
      role="toolbar"
      aria-label="Block actions"
      onMouseEnter={clearTooltipHideTimer}
      onMouseLeave={scheduleHideTooltip}
    >
      <div
        ref={addControlRef}
        className="gotipe-block-toolbar-control"
        onMouseEnter={() => showTooltip("add")}
      >
        <button
          type="button"
          aria-label="Click to add below. Option-click to add a block above"
          onFocus={() => showTooltip("add")}
          onBlur={(e) => {
            const related = e.relatedTarget as Node | null;
            if (related && toolbarRef.current?.contains(related)) return;
            scheduleHideTooltip();
          }}
          onClick={handleAddBlock}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="7" y1="2" x2="7" y2="12" />
            <line x1="2" y1="7" x2="12" y2="7" />
          </svg>
        </button>
      </div>
      <div
        ref={dragControlRef}
        className="gotipe-block-toolbar-control"
        style={{ position: "relative" }}
        onMouseEnter={() => showTooltip("drag")}
        onFocusCapture={() => showTooltip("drag")}
        onBlurCapture={(e) => {
          const related = e.relatedTarget as Node | null;
          if (related && e.currentTarget.contains(related)) return;
          if (related && toolbarRef.current?.contains(related)) return;
          scheduleHideTooltip();
        }}
      >
        <div onClick={handleContextMenuToggle} role="presentation">
          <DragHandle
            blockId={dragBlockId ?? blockId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        </div>
        <BlockContextMenu
          editor={editor}
          blockId={blockId}
          open={contextMenuOpen}
          onClose={handleCloseMenu}
        />
      </div>
      <div
        className={`gotipe-block-toolbar-tooltip${tooltipVisible ? " is-visible" : ""}`}
        role="tooltip"
        aria-hidden={tooltipVisible ? "false" : "true"}
        data-gotipe-toolbar-tooltip={tooltipKind}
        style={{ left: tooltipLeft }}
      >
        {tooltipKind === "add" ? (
          <>
            <span>Add block below</span>
            <span className="gotipe-block-toolbar-tooltip-meta">
              <kbd>Option</kbd> + Click adds above
            </span>
            <span className="gotipe-block-toolbar-tooltip-meta">
              <kbd>/</kbd> search commands
            </span>
          </>
        ) : (
          <>
            <span>Drag to move</span>
            <span className="gotipe-block-toolbar-tooltip-meta">Click to open menu</span>
          </>
        )}
      </div>
    </div>
  );
}
