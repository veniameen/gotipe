import type { GoTipeEditor } from "@gotipe/core";
import { Editor } from "@gotipe/react";
import type React from "react";
import { useCallback, useRef, useState } from "react";
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
const BLOCK_TOOLBAR_LIST_EXTRA_GAP = 12;

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

function getBlockContentLeft(blockEl: HTMLElement): number {
  const textWalker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let textNode: Node | null;
  while ((textNode = textWalker.nextNode())) {
    const text = textNode.textContent ?? "";
    if (!text.trim()) continue;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(1, text.length));
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return rect.left;
    }
  }

  const fallback =
    (blockEl.querySelector(
      "[data-gotipe-todo-content], [contenteditable='true'], p, h1, h2, h3, li, pre, blockquote",
    ) as HTMLElement | null) ?? blockEl;
  return fallback.getBoundingClientRect().left;
}

function getDropIndex(containerEl: HTMLElement, clientY: number): number {
  const blockEls = getTopLevelBlockEls(containerEl);
  for (let i = 0; i < blockEls.length; i++) {
    const rect = blockEls[i]!.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY < midY) return i;
  }
  return blockEls.length;
}

function getDropIndicatorY(containerEl: HTMLElement, dropIdx: number): number | null {
  const blockEls = getTopLevelBlockEls(containerEl);
  const containerRect = containerEl.getBoundingClientRect();

  if (blockEls.length === 0) return null;

  if (dropIdx === 0) {
    return blockEls[0]!.getBoundingClientRect().top - containerRect.top;
  }
  if (dropIdx <= blockEls.length) {
    const prevRect = blockEls[dropIdx - 1]!.getBoundingClientRect();
    return prevRect.bottom - containerRect.top;
  }
  return null;
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
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track hovered block for floating toolbar
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingBlockId) return;

      // Don't reset when hovering over the toolbar or context menu
      const target = e.target as HTMLElement;
      if (target.closest(".gotipe-block-context-menu")) {
        return;
      }

      if (!containerRef.current) return;
      const blockId = getTopLevelBlockIdAtPoint(containerRef.current, e.clientX, e.clientY);
      if (!blockId) {
        setHoveredBlockId(null);
        setToolbarPos(null);
        return;
      }

      if (blockId !== hoveredBlockId) {
        setHoveredBlockId(blockId);
        if (blockId && containerRef.current) {
          const blockEl = containerRef.current.querySelector<HTMLElement>(
            `[data-gotipe-content] > [data-block-id="${blockId}"]`,
          );
          if (blockEl) {
            const containerRect = containerRef.current.getBoundingClientRect();
            const blockRect = blockEl.getBoundingClientRect();
            const contentLeft = getBlockContentLeft(blockEl);
            const blockType = blockEl.getAttribute("data-block-type");
            const extraGap =
              blockType === "bulletList" || blockType === "orderedList" || blockType === "todoList"
                ? BLOCK_TOOLBAR_LIST_EXTRA_GAP
                : 0;
            const left = Math.max(
              0,
              Math.round(
                contentLeft - containerRect.left - BLOCK_TOOLBAR_WIDTH - BLOCK_TOOLBAR_GAP - extraGap,
              ),
            );
            setToolbarPos({ top: blockRect.top - containerRect.top, left });
          }
        }
      }
    },
    [draggingBlockId, hoveredBlockId],
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
      return;
    }
    setHoveredBlockId(null);
    setToolbarPos(null);
  }, []);

  const handleBlockDragStart = useCallback((blockId: string) => {
    setDraggingBlockId(blockId);
    setHoveredBlockId(null);
    setToolbarPos(null);
  }, []);

  const handleBlockDragEnd = useCallback(() => {
    setDraggingBlockId(null);
    setDropIndex(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!draggingBlockId || !containerRef.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const idx = getDropIndex(containerRef.current, e.clientY);
      setDropIndex(idx);
    },
    [draggingBlockId],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const blockId = e.dataTransfer.getData("text/gotipe-block-id");
      if (!blockId || !editor) return;

      const blocks = editor.getViewState().blocks;
      const currentIndex = blocks.findIndex((b) => b.id === blockId);
      if (currentIndex === -1) return;

      const targetIdx = containerRef.current
        ? getDropIndex(containerRef.current, e.clientY)
        : blocks.length;

      const adjustedTarget =
        targetIdx > currentIndex ? targetIdx - 1 : targetIdx;

      if (adjustedTarget !== currentIndex) {
        editor.chain().moveBlock(blockId, adjustedTarget).run();
      }

      setDraggingBlockId(null);
      setDropIndex(null);
    },
    [editor],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!containerRef.current?.contains(e.relatedTarget as Node)) {
        setDropIndex(null);
      }
    },
    [],
  );

  if (!editor) return null;

  const dropIndicatorY =
    dropIndex !== null && containerRef.current
      ? getDropIndicatorY(containerRef.current, dropIndex)
      : null;

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
      {showBlockToolbar && hoveredBlockId && toolbarPos && (
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
        >
          <BlockToolbar
            editor={editor}
            blockId={hoveredBlockId}
            onDragStart={handleBlockDragStart}
            onDragEnd={handleBlockDragEnd}
          />
        </div>
      )}

      {/* Drop indicator */}
      {draggingBlockId && dropIndicatorY !== null && (
        <div
          className="gotipe-drop-indicator"
          style={{ top: dropIndicatorY }}
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
