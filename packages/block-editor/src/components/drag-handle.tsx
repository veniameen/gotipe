import { useCallback, useEffect, useRef } from "react";
import type { useTouchDrag } from "../interaction/use-touch-drag";

export interface DragHandleProps {
  blockId: string;
  /** Alt-drag moves the complete top-level block when the normal handle targets a row. */
  wholeBlockId?: string;
  onDragStart: (blockId: string) => void;
  onDragEnd: () => void;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  touchDrag?: Pick<ReturnType<typeof useTouchDrag>, "begin" | "onClickCapture">;
}

export function DragHandle({
  blockId,
  wholeBlockId,
  onDragStart,
  onDragEnd,
  touchDrag,
  onClick,
}: DragHandleProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const activeBlockId = useRef(blockId);
  const findBlock = useCallback(() => {
    const root = buttonRef.current?.closest("[data-gotipe-block-editor]");
    return root?.querySelector(`[data-block-id="${CSS.escape(activeBlockId.current)}"]`) ?? null;
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      const id = e.altKey && wholeBlockId ? wholeBlockId : blockId;
      activeBlockId.current = id;
      e.dataTransfer.setData("text/gotipe-block-id", id);
      e.dataTransfer.effectAllowed = "move";

      // Mark dragged element for visual feedback; keep native drag preview.
      // Using a large custom drag image can cause platform-specific stalls.
      const blockEl = findBlock();
      if (blockEl) {
        blockEl.classList.add("dragging");
      }

      onDragStart(id);
    },
    [blockId, wholeBlockId, findBlock, onDragStart],
  );

  const handleDragEnd = useCallback(() => {
    const blockEl = findBlock();
    if (blockEl) {
      blockEl.classList.remove("dragging");
    }
    onDragEnd();
  }, [findBlock, onDragEnd]);

  useEffect(
    () => () => {
      findBlock()?.classList.remove("dragging");
    },
    [findBlock],
  );

  return (
    <button
      ref={buttonRef}
      type="button"
      className="gotipe-drag-handle-btn"
      draggable
      aria-label="Drag to move, click to open menu"
      data-gotipe-drag-handle=""
      data-block-drag={blockId}
      data-block-drag-whole={wholeBlockId}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{ touchAction: "none" }}
      onPointerDown={(event) => touchDrag?.begin(event, blockId)}
      onClickCapture={touchDrag?.onClickCapture}
      onClick={onClick}
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
