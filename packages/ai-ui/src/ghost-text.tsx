import type { GoTipeEditor } from "@gotipe/core";
import { useEffect } from "react";

export interface GhostTextProps {
  editor: GoTipeEditor;
  text: string;
  onAccept: () => void;
  onDismiss: () => void;
}
export function GhostText({ editor, text, onAccept, onDismiss }: GhostTextProps) {
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
