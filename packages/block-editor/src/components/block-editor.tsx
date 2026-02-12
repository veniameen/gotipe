import type { GoTipeEditor } from "@gotipe/core";
import { Editor } from "@gotipe/react";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { AiCommandBar } from "./ai-command-bar";
import { AiStatusIndicator } from "./ai-status-indicator";
import { BlockToolbar } from "./block-toolbar";
import { SlashMenu } from "./slash-menu";
import type { Suggestion } from "./suggestion-toolbar";
import { SuggestionToolbar } from "./suggestion-toolbar";
import { ThemeToggle } from "./theme-toggle";

export interface BlockEditorProps {
  editor: GoTipeEditor | null;
  className?: string;
  style?: React.CSSProperties;
  showSlashMenu?: boolean;
  showBlockToolbar?: boolean;
  showCollaborationCursors?: boolean;
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

function getBlockIdFromElement(el: HTMLElement | null): string | null {
  while (el) {
    const id = el.getAttribute("data-block-id");
    if (id) return id;
    el = el.parentElement;
  }
  return null;
}

function getDropIndex(containerEl: HTMLElement, clientY: number): number {
  const blockEls = containerEl.querySelectorAll<HTMLElement>("[data-block-id]");
  for (let i = 0; i < blockEls.length; i++) {
    const rect = blockEls[i]!.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY < midY) return i;
  }
  return blockEls.length;
}

function getDropIndicatorY(containerEl: HTMLElement, dropIdx: number): number | null {
  const blockEls = containerEl.querySelectorAll<HTMLElement>("[data-block-id]");
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
  showAiCommandBar = true,
  showThemeToggle = false,
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
  const [toolbarPos, setToolbarPos] = useState<{ top: number } | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track hovered block for floating toolbar
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingBlockId) return;
      const blockId = getBlockIdFromElement(e.target as HTMLElement);
      if (blockId !== hoveredBlockId) {
        setHoveredBlockId(blockId);
        if (blockId && containerRef.current) {
          const blockEl = containerRef.current.querySelector(
            `[data-block-id="${blockId}"]`,
          );
          if (blockEl) {
            const containerRect = containerRef.current.getBoundingClientRect();
            const blockRect = blockEl.getBoundingClientRect();
            setToolbarPos({ top: blockRect.top - containerRect.top });
          }
        } else {
          setToolbarPos(null);
        }
      }
    },
    [draggingBlockId, hoveredBlockId],
  );

  const handleMouseLeave = useCallback(() => {
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

  return (
    <div
      ref={containerRef}
      className={`gotipe-block-editor ${className ?? ""}`}
      style={{ ...style, position: "relative" }}
      data-gotipe-block-editor=""
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      onMouseMove={showBlockToolbar ? handleMouseMove : undefined}
      onMouseLeave={showBlockToolbar ? handleMouseLeave : undefined}
    >
      <Editor editor={editor}>
        {showSlashMenu && <SlashMenu editor={editor} />}
        {children}
      </Editor>

      {/* Floating block toolbar — positioned next to hovered block */}
      {showBlockToolbar && hoveredBlockId && toolbarPos && (
        <div
          style={{
            position: "absolute",
            top: toolbarPos.top,
            left: -48,
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
