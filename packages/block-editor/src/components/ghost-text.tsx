import type { GoTipeEditor } from "@gotipe/core";
import { FloatingPortal, useFloatingPosition } from "@gotipe/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { aiControls } from "./ai-controls";

export interface GhostTextProps {
  editor: GoTipeEditor;
}
interface GhostState {
  text: string;
  blockId: string;
  offset: number;
}

/**
 * A clipped line at the caret follows the editor on scroll/container resize. Only an editor with
 * `defineAi` suggests a continuation; without it there is nothing to draw or listen to.
 */
export function GhostText({ editor }: GhostTextProps) {
  return aiControls(editor).status ? <Ghost editor={editor} /> : null;
}

function Ghost({ editor }: GhostTextProps) {
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const overlay = useRef<HTMLSpanElement>(null);
  const width = useRef(0);
  const lineHeight = useRef(0);
  useEffect(() => {
    setGhost(null);
    const change = editor.on("aiGhostTextChange", setGhost);
    const blur = editor.on("blur", () => setGhost(null));
    const destroy = editor.on("destroy", () => setGhost(null));
    return () => {
      change();
      blur();
      destroy();
    };
  }, [editor]);
  const anchor = useCallback(() => {
    const element = editor.element;
    const selection = element?.ownerDocument.getSelection();
    if (!ghost || !element || !selection?.rangeCount || !element.contains(selection.anchorNode))
      return null;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.height) return null;
    width.current = Math.max(0, element.getBoundingClientRect().right - rect.right - 8);
    lineHeight.current = rect.height;
    return {
      ...rect.toJSON(),
      top: rect.top,
      bottom: rect.top,
      left: rect.right,
      right: rect.right,
      width: 0,
      height: rect.height,
    };
  }, [editor, ghost]);
  const position = useFloatingPosition({
    open: !!ghost,
    anchor,
    element: overlay,
    placement: "bottom-start",
    gap: 0,
    observe: editor.element,
  });
  if (!ghost || !editor.element) return null;
  return (
    <FloatingPortal owner={editor.element}>
      <span
        ref={overlay}
        className="gotipe-ghost-text"
        contentEditable={false}
        aria-hidden="true"
        data-gotipe-ghost-text=""
        style={{
          ...position,
          position: "fixed",
          // CSS constrains the line during the resize itself, before browser
          // observers deliver the caret's new position to React.
          left: position ? `min(${position.left}px, calc(100vw - 8px))` : undefined,
          right: 8,
          visibility: position ? "visible" : "hidden",
          maxWidth: Math.min(width.current, position?.maxWidth ?? width.current),
          lineHeight: `${lineHeight.current}px`,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {ghost.text}
      </span>
    </FloatingPortal>
  );
}
