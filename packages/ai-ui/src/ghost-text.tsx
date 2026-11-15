import type { GoTipeEditor } from "@gotipe/core";
import { useEffect } from "react";

export interface AiGhostTextProps {
  editor: GoTipeEditor;
  text: string;
  onAccept: () => void;
  onDismiss: () => void;
}
/**
 * A controlled ghost text: your completion state draws it, Tab accepts it. Not `GhostText` of
 * `@gotipe/block-editor`, which reads the editor's events itself.
 */
export function AiGhostText({ editor, text, onAccept, onDismiss }: AiGhostTextProps) {
  useEffect(() => {
    const owner = editor.element?.ownerDocument;
    if (!owner) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        editor.isDestroyed ||
        !editor.isEditable ||
        !(event.target instanceof Node) ||
        !editor.element?.contains(event.target)
      )
        return;
      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        onAccept();
      } else if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) onDismiss();
    };
    owner.addEventListener("keydown", handleKeyDown);
    return () => owner.removeEventListener("keydown", handleKeyDown);
  }, [editor, onAccept, onDismiss]);
  return (
    <span className="gotipe-ghost-text" aria-live="polite" contentEditable={false}>
      {text}
    </span>
  );
}

/** @deprecated Use `AiGhostText`; `@gotipe/block-editor` has a different `GhostText`. */
export const GhostText = AiGhostText;
/** @deprecated Use `AiGhostTextProps`. */
export type GhostTextProps = AiGhostTextProps;
