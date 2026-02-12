export function DragHandle({
  blockId,
  onDragStart,
}: { blockId: string; onDragStart: (blockId: string) => void }) {
  return (
    <button
      type="button"
      className="gotipe-drag-handle"
      draggable
      aria-label="Drag to reorder block"
      onDragStart={() => onDragStart(blockId)}
      data-block-drag={blockId}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <title>Drag handle</title>
        <circle cx="7" cy="5" r="1" />
        <circle cx="11" cy="5" r="1" />
        <circle cx="7" cy="9" r="1" />
        <circle cx="11" cy="9" r="1" />
        <circle cx="7" cy="13" r="1" />
        <circle cx="11" cy="13" r="1" />
      </svg>
    </button>
  );
}
