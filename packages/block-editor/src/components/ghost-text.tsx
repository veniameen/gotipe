import type { GoTipeEditor } from "@gotipe/core";
import { useEffect, useRef, useState } from "react";

export interface GhostTextProps {
  editor: GoTipeEditor;
}

interface GhostState {
  text: string;
  blockId: string;
  offset: number;
}

/**
 * Renders ghost text (AI autocomplete suggestion) as an overlay
 * positioned at the current cursor location.
 * Tab accepts, Escape dismisses.
 */
export function GhostText({ editor }: GhostTextProps) {
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const overlayRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const unsub = editor.on("aiGhostTextChange", (g: GhostState | null) => {
      setGhost(g);
    });
    return unsub;
  }, [editor]);

  useEffect(() => {
    if (!ghost || !overlayRef.current) return;

    // Position the ghost text at the cursor location
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Find the editor container for relative positioning
    const container = overlayRef.current.closest("[data-gotipe-block-editor]");
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    overlayRef.current.style.top = `${rect.top - containerRect.top}px`;
    overlayRef.current.style.left = `${rect.right - containerRect.left}px`;
    overlayRef.current.style.lineHeight = `${rect.height}px`;
  }, [ghost]);

  if (!ghost) return null;

  return (
    <span
      ref={overlayRef}
      className="gotipe-ghost-text"
      contentEditable={false}
      aria-hidden="true"
      data-gotipe-ghost-text=""
    >
      {ghost.text}
    </span>
  );
}
