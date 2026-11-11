import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useState } from "react";
import { PageIcon } from "../page/icons";

export interface Suggestion {
  id: string;
  type: "insert" | "delete" | "replace";
  blockId: string;
  from: number;
  to: number;
  originalText: string;
  suggestedText: string;
}

export interface SuggestionToolbarProps {
  editor: GoTipeEditor;
  suggestions: Suggestion[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onAccept: (suggestion: Suggestion) => void;
  onReject: (suggestion: Suggestion) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

export function SuggestionToolbar({
  editor,
  suggestions,
  currentIndex,
  onNavigate,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
}: SuggestionToolbarProps) {
  const total = suggestions.length;
  const index = Math.min(Math.max(currentIndex, 0), Math.max(0, total - 1));
  const current = suggestions[index];
  const [editable, setEditable] = useState(editor.isEditable);
  useEffect(() => {
    setEditable(editor.isEditable);
    const off = editor.on("editableChange", setEditable);
    const destroy = editor.on("destroy", () => setEditable(false));
    return () => {
      off();
      destroy();
    };
  }, [editor]);

  const handlePrev = useCallback(() => {
    if (index > 0) onNavigate(index - 1);
  }, [index, onNavigate]);

  const handleNext = useCallback(() => {
    if (index < total - 1) onNavigate(index + 1);
  }, [index, total, onNavigate]);

  const handleAcceptCurrent = useCallback(() => {
    if (current && editor.isEditable && !editor.isDestroyed) onAccept(current);
  }, [current, editor, onAccept]);

  const handleRejectCurrent = useCallback(() => {
    if (current) onReject(current);
  }, [current, onReject]);

  if (total === 0) return null;

  return (
    <div
      className="gotipe-suggestion-toolbar"
      role="toolbar"
      aria-label="AI suggestions"
      data-gotipe-suggestion-toolbar=""
    >
      <span className="gotipe-suggestion-counter" aria-live="polite">
        {index + 1}/{total}
      </span>

      <div className="gotipe-bubble-menu-separator" aria-hidden="true" />

      <button
        type="button"
        onClick={handlePrev}
        disabled={index === 0}
        aria-label="Previous suggestion"
      >
        <PageIcon name="chevronLeft" />
      </button>
      <button
        type="button"
        onClick={handleNext}
        disabled={index >= total - 1}
        aria-label="Next suggestion"
      >
        <PageIcon name="chevronRight" />
      </button>

      <div className="gotipe-bubble-menu-separator" aria-hidden="true" />

      <button
        type="button"
        onClick={handleAcceptCurrent}
        disabled={!editable}
        aria-label="Accept current suggestion"
      >
        <PageIcon name="check" />
      </button>
      <button type="button" onClick={handleRejectCurrent} aria-label="Reject current suggestion">
        <PageIcon name="close" />
      </button>

      <div className="gotipe-bubble-menu-separator" aria-hidden="true" />

      <button
        type="button"
        onClick={() => {
          if (editor.isEditable && !editor.isDestroyed) onAcceptAll();
        }}
        disabled={!editable}
        aria-label="Accept all suggestions"
        data-action="accept-all"
        className="is-primary"
      >
        Accept All
      </button>
      <button
        type="button"
        onClick={onRejectAll}
        aria-label="Reject all suggestions"
        data-action="reject-all"
      >
        Reject All
      </button>
    </div>
  );
}
