import type { Block, GoTipeEditor, Transaction } from "@gotipe/core";
import { useFloatingPosition } from "@gotipe/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BlockContextMenu } from "./block-context-menu";
import { DragHandle, type DragHandleProps } from "./drag-handle";

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

function createInsertedBlock(parentType: string | null, blockId: string): Block {
  if (parentType === "bulletList" || parentType === "orderedList") {
    return {
      id: blockId,
      type: "listItem",
      attrs: {},
      content: [],
      children: [],
    };
  }
  if (parentType === "todoList") {
    return {
      id: blockId,
      type: "todoItem",
      attrs: { checked: false },
      content: [],
      children: [],
    };
  }
  return {
    id: blockId,
    type: "paragraph",
    attrs: {},
    content: [],
    children: [],
  };
}

export interface BlockToolbarProps {
  editor: GoTipeEditor;
  blockId: string;
  addBlockId?: string;
  dragBlockId?: string;
  onDragStart: (blockId: string) => void;
  onDragEnd: () => void;
  touchDrag?: DragHandleProps["touchDrag"];
  openSlashMenuOnAdd?: boolean;
}

export function BlockToolbar({
  editor,
  blockId,
  addBlockId,
  dragBlockId,
  onDragStart,
  onDragEnd,
  touchDrag,
  openSlashMenuOnAdd = false,
}: BlockToolbarProps) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [tooltipKind, setTooltipKind] = useState<"add" | "drag">("add");
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
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

  const tooltipAnchor = useCallback(
    () =>
      (tooltipKind === "add"
        ? addControlRef.current
        : dragControlRef.current
      )?.getBoundingClientRect() ?? null,
    [tooltipKind],
  );
  const tooltipPosition = useFloatingPosition({
    open: tooltipVisible,
    anchor: tooltipAnchor,
    element: tooltipRef,
    placement: "top",
  });

  const showTooltip = useCallback(
    (kind: "add" | "drag") => {
      clearTooltipHideTimer();
      setTooltipKind(kind);
      setTooltipVisible(true);
    },
    [clearTooltipHideTimer],
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

  const handleContextMenuToggle = useCallback(() => {
    hideTooltip();
    setContextMenuOpen((prev) => !prev);
  }, [hideTooltip]);

  const handleAddBlock = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!editor.isEditable) return;
      const state = editor.getViewState();
      const insertionTargetId = addBlockId ?? blockId;
      const location = findBlockLocation(state.blocks, insertionTargetId);
      if (!location) return;

      const insertAbove = e.altKey;
      const newBlockId = crypto.randomUUID();
      const newBlock = createInsertedBlock(location.parentType, newBlockId);

      const steps: Transaction["steps"] = [
        {
          type: "insertBlock",
          parentId: location.parentId,
          index: location.index + (insertAbove ? 0 : 1),
          block: newBlock,
        },
      ];
      if (openSlashMenuOnAdd) {
        steps.push({
          type: "insertText",
          blockId: newBlockId,
          offset: 0,
          text: "/",
          marks: [],
        });
      }
      // Adding from the toolbar is one action, including its command trigger.
      editor.dispatch({
        steps,
        selection: {
          type: "cursor",
          blockId: newBlockId,
          offset: openSlashMenuOnAdd ? 1 : 0,
        },
      });
      hideTooltip();
      editor.focus();
      if (openSlashMenuOnAdd) editor.emit("openSlashMenu");
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
        <DragHandle
          blockId={dragBlockId ?? blockId}
          wholeBlockId={blockId}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          touchDrag={touchDrag}
          onClick={handleContextMenuToggle}
        />
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
        ref={tooltipRef}
        style={{
          ...tooltipPosition,
          position: "fixed",
          transform: "none",
          visibility: tooltipVisible && tooltipPosition ? "visible" : "hidden",
        }}
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
            {dragBlockId && dragBlockId !== blockId && (
              <span className="gotipe-block-toolbar-tooltip-meta">
                Alt-drag moves the whole list
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
