import type { GoTipeEditor } from "@gotipe/core";
import { useEffect } from "react";

export interface GhostTextProps {
  editor: GoTipeEditor;
  text: string;
  onAccept: () => void;
  onDismiss: () => void;
}

export function GhostText({ editor: _editor, text, onAccept, onDismiss }: GhostTextProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        onAccept();
      } else if (e.key === "Escape") {
        onDismiss();
      } else {
        onDismiss();
      } // Dismiss on any other keystroke
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onAccept, onDismiss]);

  return (
    <span className="gotipe-ghost-text" aria-live="polite">
      {text}
    </span>
  );
}
