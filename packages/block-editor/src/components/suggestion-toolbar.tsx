import type { GoTipeEditor } from "@gotipe/core";
import { useCallback } from "react";

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
  suggestions,
  currentIndex,
  onNavigate,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
}: SuggestionToolbarProps) {
  const total = suggestions.length;
  const current = suggestions[currentIndex];

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) onNavigate(currentIndex - 1);
  }, [currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (currentIndex < total - 1) onNavigate(currentIndex + 1);
  }, [currentIndex, total, onNavigate]);

  const handleAcceptCurrent = useCallback(() => {
    if (current) onAccept(current);
  }, [current, onAccept]);

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
        {currentIndex + 1}/{total}
      </span>

      <div className="gotipe-bubble-menu-separator" role="separator" />

      <button
        type="button"
        onClick={handlePrev}
        disabled={currentIndex === 0}
        aria-label="Previous suggestion"
      >
        ◄
      </button>
      <button
        type="button"
        onClick={handleNext}
        disabled={currentIndex >= total - 1}
        aria-label="Next suggestion"
      >
        ►
      </button>

      <div className="gotipe-bubble-menu-separator" role="separator" />

      <button type="button" onClick={handleAcceptCurrent} aria-label="Accept current suggestion">
        ✓
      </button>
      <button type="button" onClick={handleRejectCurrent} aria-label="Reject current suggestion">
        ✗
      </button>

      <div className="gotipe-bubble-menu-separator" role="separator" />

      <button
        type="button"
        onClick={onAcceptAll}
        aria-label="Accept all suggestions"
        data-action="accept-all"
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
