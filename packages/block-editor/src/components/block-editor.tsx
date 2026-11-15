import { type BlockViews, Editor } from "@gotipe/react";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AtomUI } from "../atoms/atom-ui";
import { type DragPoint, useTouchDrag } from "../interaction/use-touch-drag";
import { handleRail, inHandleReach } from "../text/direction";
import { FindBar } from "../text/find-bar";
import { StatusLine } from "../text/status-line";
import { codeBlockViewFor } from "../views/code-block-view";
import { TableCellView } from "../views/table-cell-view";
import { AiCommandBar } from "./ai-command-bar";
import { AiStatusIndicator } from "./ai-status-indicator";
import type { BlockEditorProps } from "./block-editor-props";
import {
  type DropTarget,
  LIST_ITEM_TYPES,
  ROW_DRAGGABLE_LIST_TYPES,
  findBlockLocation,
  getBlockElById,
  getBlockFirstLineMetrics,
  getDropIndexForParent,
  getDropIndicatorHorizontalInsets,
  getDropIndicatorYForParent,
  getRowAnchorBlockIdAtPoint,
  getToolbarRailLeft,
  handleTargets,
  moveDraggedBlock,
  resolveListRowDropTarget,
} from "./block-interaction";
import { BlockToolbar } from "./block-toolbar";
import { BlockEditorBubbleMenu } from "./bubble-menu";
import {
  COLLABORATION_LAYER,
  CollaborationCursors,
  useOverlayPeers,
} from "./collaboration-cursors";
import { DocsOutline } from "./docs-outline";
import { EditorProviders } from "./editor-providers";
import { EditorErrorToast, EditorSkeleton, EditorStarters } from "./editor-states";
import { GhostText } from "./ghost-text";
import { SlashMenu } from "./slash-menu";
import { SuggestionToolbar } from "./suggestion-toolbar";
import { ThemeToggle } from "./theme-toggle";

/** The overlay draws other people (Atlas frame 12); the document renderer must not repeat them. */
const HOST_LAYERS = [COLLABORATION_LAYER];
const TOOLBAR_HIDE_DELAY_MS = 20;
const TOOLBAR_HOVER_X_MIN_OFFSET = 120;
const TOOLBAR_HOVER_X_MAX_OFFSET = 560;

export type { BlockEditorProps } from "./block-editor-props";

function BlockEditorView({
  editor,
  className,
  style,
  view = "notion",
  header,
  starters = header !== undefined && (view === "notion" || view === "docs"),
  highlight,
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
  blockViews: hostViews,
  slashCommands,
  ariaLabel,
  errorToast = true,
  find = true,
  status = false,
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
  const [toolbarPos, setToolbarPos] = useState<{
    top: number;
    left: number;
    right: number | null;
  } | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayPeers = useOverlayPeers(editor, remotePeers);
  // shared cells carry the column menu (Atlas frame 9); the host's views win
  const blockViews = useMemo<BlockViews>(
    () => ({
      tableHeader: TableCellView,
      tableCell: TableCellView,
      ...(highlight ? { codeBlock: codeBlockViewFor(highlight) } : {}),
      ...hostViews,
    }),
    [highlight, hostViews],
  );
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
        top: line.top - container.top + line.height / 2,
        ...handleRail(root, block, getToolbarRailLeft),
      };
      setToolbarPos((previous) =>
        previous?.top === next.top && previous.left === next.left && previous.right === next.right
          ? previous
          : next,
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
      clearHideToolbarTimer();

      const anchorEl = getBlockElById(containerRef.current, anchorBlockId);
      if (!anchorEl) return;
      // A list row (or the row a block sits in) is its own unit; elsewhere the top-level block.
      const { actionBlockId, addBlockId, dragBlockId } = handleTargets(
        containerRef.current,
        anchorBlockId,
      );
      // Atlas frame 28: an RTL block's handle and reach are on its right, where its lines start.
      if (
        !inHandleReach(
          containerRef.current,
          anchorEl,
          e.clientX,
          TOOLBAR_HOVER_X_MIN_OFFSET,
          TOOLBAR_HOVER_X_MAX_OFFSET,
        )
      ) {
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
        const top = firstLine.top - containerRect.top + firstLine.height / 2;
        setToolbarPos({ top, ...handleRail(containerRef.current, anchorEl, getToolbarRailLeft) });
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

  if (!editor)
    return (
      <div className="gotipe-block-editor" data-gotipe-block-loading="" data-gt-view={view}>
        <EditorSkeleton />
      </div>
    );

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
      data-gt-view={view}
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
      {view === "docs" && <DocsOutline editor={editor} />}
      <Editor
        editor={editor}
        blockViews={blockViews}
        hostLayers={HOST_LAYERS}
        ariaLabel={ariaLabel}
        slotBefore={
          <>
            {find && <FindBar editor={editor} root={containerRef} />}
            {showThemeToggle && (
              <div className="gotipe-block-editor-tools">
                <ThemeToggle />
              </div>
            )}
            {header}
          </>
        }
      >
        {starters && <EditorStarters editor={editor} />}
        {errorToast && <EditorErrorToast editor={editor} />}
        {status && <StatusLine editor={editor} {...(status === true ? {} : status)} />}
        {showSlashMenu && (
          <SlashMenu editor={editor} commands={slashCommands ?? editor.getSlashCommands()} />
        )}
        <AtomUI editor={editor} />
        {showBubbleMenu && <BlockEditorBubbleMenu editor={editor} enableAI={showAiCommandBar} />}
        {children}
      </Editor>

      {/* Remote collaboration cursors */}
      {overlayPeers.length > 0 && (
        <CollaborationCursors peers={overlayPeers} containerRef={containerRef} />
      )}

      {/* Floating block toolbar — positioned in the left padding gutter */}
      {showBlockToolbar && editable && hoveredToolbarTarget && toolbarPos && (
        <div
          className="gotipe-block-toolbar-wrapper"
          dir={toolbarPos.right === null ? undefined : "rtl"}
          style={
            toolbarPos.right === null
              ? { top: toolbarPos.top, left: toolbarPos.left }
              : { top: toolbarPos.top, right: toolbarPos.right }
          }
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

      {/* AI Command Bar — Mod-j toggled floating input */}
      {showAiCommandBar && <AiCommandBar editor={editor} onSubmit={onAiCommand} />}

      {/* AI Status Indicator — footer bar during AI processing */}
      {showAiCommandBar && <AiStatusIndicator editor={editor} />}
    </div>
  );
}

export const BlockEditor = (props: BlockEditorProps) => (
  <EditorProviders mentions={props.mentions} emoji={props.emoji}>
    <BlockEditorView {...props} />
  </EditorProviders>
);
