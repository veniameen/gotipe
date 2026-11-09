import { useCallback, useRef } from "react";

export interface DragHandleProps {
  blockId: string;
  onDragStart: (blockId: string) => void;
  onDragEnd: () => void;
}

const LONG_PRESS_MS = 300;

export function DragHandle({ blockId, onDragStart, onDragEnd }: DragHandleProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      e.dataTransfer.setData("text/gotipe-block-id", blockId);
      e.dataTransfer.effectAllowed = "move";

      // Mark dragged element for visual feedback; keep native drag preview.
      // Using a large custom drag image can cause platform-specific stalls.
      const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
      if (blockEl) {
        blockEl.classList.add("dragging");
      }

      onDragStart(blockId);
    },
    [blockId, onDragStart],
  );

  const handleDragEnd = useCallback(() => {
    const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
    if (blockEl) {
      blockEl.classList.remove("dragging");
    }
    onDragEnd();
  }, [blockId, onDragEnd]);

  // Touch: long-press activation
  const handleTouchStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
      if (blockEl) {
        blockEl.classList.add("dragging");
      }
      onDragStart(blockId);
    }, LONG_PRESS_MS);
  }, [blockId, onDragStart]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
    if (blockEl) {
      blockEl.classList.remove("dragging");
    }
    onDragEnd();
  }, [blockId, onDragEnd]);

  return (
    <button
      type="button"
      className="gotipe-drag-handle-btn"
      draggable
      aria-label="Drag to move, click to open menu"
      data-gotipe-drag-handle=""
      data-block-drag={blockId}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="3" r="1.2" />
        <circle cx="9" cy="3" r="1.2" />
        <circle cx="5" cy="7" r="1.2" />
        <circle cx="9" cy="7" r="1.2" />
        <circle cx="5" cy="11" r="1.2" />
        <circle cx="9" cy="11" r="1.2" />
      </svg>
    </button>
  );
}
