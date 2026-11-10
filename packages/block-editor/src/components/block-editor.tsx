import type { GoTipeEditor } from "@gotipe/core";
import { Editor } from "@gotipe/react";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type DragPoint, useTouchDrag } from "../interaction/use-touch-drag";
import { AiCommandBar } from "./ai-command-bar";
import { AiStatusIndicator } from "./ai-status-indicator";
import {
  type DropTarget,
  LIST_ITEM_TYPES,
  ROW_DRAGGABLE_LIST_TYPES,
  findBlockLocation,
  getBlockElById,
  getBlockFirstLineMetrics,
  getBlockTextLeft,
  getDropIndexForParent,
  getDropIndicatorHorizontalInsets,
  getDropIndicatorYForParent,
  getRowAnchorBlockIdAtPoint,
  getToolbarRailLeft,
  getTopLevelAncestorBlockId,
  moveDraggedBlock,
  resolveListRowDropTarget,
} from "./block-interaction";
import { BlockToolbar } from "./block-toolbar";
import { BlockEditorBubbleMenu } from "./bubble-menu";
import type { RemotePeer } from "./collaboration-cursors";
import { CollaborationCursors } from "./collaboration-cursors";
import { GhostText } from "./ghost-text";
import { SlashMenu } from "./slash-menu";
import type { Suggestion } from "./suggestion-toolbar";
import { SuggestionToolbar } from "./suggestion-toolbar";
import { ThemeToggle } from "./theme-toggle";

const BLOCK_TOOLBAR_WIDTH = 50;
const BLOCK_TOOLBAR_BUTTON_SIZE = 24;
const TOOLBAR_HIDE_DELAY_MS = 20;
const TOOLBAR_HOVER_X_MIN_OFFSET = 120;
const TOOLBAR_HOVER_X_MAX_OFFSET = 560;

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
  const [editable, setEditable] = useState(editor?.isEditable ?? false);
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

  useEffect(() => {
    setEditable(editor?.isEditable ?? false);
    return editor?.on("editableChange", (value) => {
      setEditable(value);
      if (!value) hideToolbarNow();
    });
  }, [editor, hideToolbarNow]);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root || !hoveredToolbarTarget || !editor) return;
    const update = () => {
      const block = getBlockElById(root, hoveredToolbarTarget.anchorBlockId);
      if (!block) return hideToolbarNow();
      const container = root.getBoundingClientRect();
      const line = getBlockFirstLineMetrics(block);
      const next = {
        top: line.top - container.top + (line.height - BLOCK_TOOLBAR_BUTTON_SIZE) / 2,
        left: getToolbarRailLeft(root),
      };
      setToolbarPos((previous) =>
        previous?.top === next.top && previous.left === next.left ? previous : next,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(root);
    const unsubscribe = editor.on("viewStateChange", update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    update();
    return () => {
      observer.disconnect();
      unsubscribe();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [editor, hoveredToolbarTarget, hideToolbarNow]);

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
        anchorType === "listItem" || anchorType === "todoItem" ? anchorBlockId : actionBlockId;
      const dragBlockId =
        anchorType === "listItem" || anchorType === "todoItem" ? anchorBlockId : actionBlockId;
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
        const firstLine = getBlockFirstLineMetrics(anchorEl);
        const left = getToolbarRailLeft(containerRef.current);
        const top =
          firstLine.top - containerRect.top + (firstLine.height - BLOCK_TOOLBAR_BUTTON_SIZE) / 2;
        setToolbarPos({
          top,
          left,
        });
      }
    },
    [clearHideToolbarTimer, draggingBlockId, hoveredToolbarTarget, scheduleHideToolbar],
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
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
    },
    [clearHideToolbarTimer, scheduleHideToolbar],
  );

  const handleBlockDragStart = useCallback(
    (blockId: string) => {
      if (!editor?.isEditable) return;
      clearHideToolbarTimer();
      containerRef.current &&
        getBlockElById(containerRef.current, blockId)?.classList.add("dragging");
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
    },
    [clearHideToolbarTimer, editor],
  );

  const handleBlockDragEnd = useCallback(() => {
    clearHideToolbarTimer();
    if (containerRef.current && draggingBlockIdRef.current)
      getBlockElById(containerRef.current, draggingBlockIdRef.current)?.classList.remove(
        "dragging",
      );
    draggingBlockIdRef.current = null;
    draggingBlockTypeRef.current = null;
    draggingParentIdRef.current = null;
    dropTargetRef.current = null;
    setDraggingBlockId(null);
    setDraggingBlockType(null);
    setDraggingParentId(null);
    setDropTarget(null);
  }, [clearHideToolbarTimer]);

  const touchTarget = useCallback(
    (point: DragPoint): DropTarget | null => {
      const root = containerRef.current;
      const id = draggingBlockIdRef.current;
      if (!root || !id || !editor?.isEditable || editor.isDestroyed) return null;
      const rect = root.getBoundingClientRect();
      if (
        point.x < rect.left ||
        point.x > rect.right ||
        point.y < Math.max(0, rect.top) ||
        point.y > Math.min(window.innerHeight, rect.bottom)
      )
        return null;
      const type = draggingBlockTypeRef.current;
      return type && LIST_ITEM_TYPES.has(type)
        ? resolveListRowDropTarget(root, editor.getViewState().blocks, type, point.x, point.y)
        : { parentId: null, index: getDropIndexForParent(root, null, point.y) };
    },
    [editor],
  );
  const touchDrag = useTouchDrag({
    enabled: editable,
    root: () => (editor?.isDestroyed ? null : containerRef.current),
    start: (id) => {
      if (!editor?.isEditable || editor.isDestroyed) return false;
      handleBlockDragStart(id);
      return true;
    },
    move: (point) => {
      const target = touchTarget(point);
      dropTargetRef.current = target;
      setDropTarget(target);
    },
    drop: (point) => {
      const target = touchTarget(point);
      const id = draggingBlockIdRef.current;
      if (target && id && editor) {
        moveDraggedBlock(editor, id, target);
        editor.focus();
      }
    },
    end: handleBlockDragEnd,
  });

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
      if (prevTarget?.parentId !== nextTarget.parentId || prevTarget?.index !== nextTarget.index) {
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
      const fallbackIndex = containerRef.current
        ? getDropIndexForParent(containerRef.current, fallbackParentId, e.clientY)
        : currentLocation.index;
      const target = dropTarget ?? { parentId: fallbackParentId, index: fallbackIndex };

      moveDraggedBlock(editor, blockId, target);

      draggingBlockIdRef.current = null;
      draggingBlockTypeRef.current = null;
      draggingParentIdRef.current = null;
      dropTargetRef.current = null;
      setDraggingBlockId(null);
      setDraggingBlockType(null);
      setDraggingParentId(null);
      setDropTarget(null);
    },
    [draggingBlockId, draggingParentId, dropTarget, editor],
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      dropTargetRef.current = null;
      setDropTarget(null);
    }
  }, []);

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
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={containerRef}
      className={editorClasses}
      style={{ ...style, position: "relative" }}
      data-gotipe-block-editor=""
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      onMouseMove={showBlockToolbar && editable ? handleMouseMove : undefined}
      onPointerDown={
        showBlockToolbar && editable
          ? (event) => {
              if (event.pointerType !== "mouse") handleMouseMove(event);
            }
          : undefined
      }
      onMouseLeave={showBlockToolbar ? handleMouseLeave : undefined}
    >
      <Editor
        editor={editor}
        slotBefore={
          showThemeToggle ? (
            <div className="gotipe-block-editor-tools">
              <ThemeToggle />
            </div>
          ) : undefined
        }
      >
        {showSlashMenu && <SlashMenu editor={editor} commands={editor.getSlashCommands()} />}
        {showBubbleMenu && <BlockEditorBubbleMenu editor={editor} enableAI={showAiCommandBar} />}
        {children}
      </Editor>

      {/* Remote collaboration cursors */}
      {remotePeers && remotePeers.length > 0 && (
        <CollaborationCursors peers={remotePeers} containerRef={containerRef} />
      )}

      {/* Floating block toolbar — positioned in the left padding gutter */}
      {showBlockToolbar && editable && hoveredToolbarTarget && toolbarPos && (
        <div
          className="gotipe-block-toolbar-wrapper"
          style={{
            position: "absolute",
            top: toolbarPos.top,
            left: toolbarPos.left,
            width: BLOCK_TOOLBAR_WIDTH,
            height: BLOCK_TOOLBAR_BUTTON_SIZE,
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
            touchDrag={touchDrag}
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
      {showAiCommandBar && <AiCommandBar editor={editor} onSubmit={onAiCommand} />}

      {/* AI Status Indicator — footer bar during AI processing */}
      {showAiCommandBar && <AiStatusIndicator editor={editor} />}
    </div>
  );
}
