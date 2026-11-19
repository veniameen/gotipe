export interface AnchorRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

/**
 * `top` centres the panel over the anchor; `top-start` aligns it to the anchor's left edge.
 * Both fall back below the anchor when there is no room above.
 */
export type FloatingPlacement = "top" | "top-start" | "bottom-start" | "left-start";

/** Positions a panel inside the visual viewport, including narrow/mobile windows. */
export function computeFloatingPosition(
  anchor: AnchorRect,
  size: { width: number; height: number },
  viewport: { left: number; top: number; width: number; height: number },
  placement: FloatingPlacement = "bottom-start",
  gap = 6,
  offset = { x: 0, y: 0 },
) {
  const padding = 8;
  const minLeft = viewport.left + padding;
  const minTop = viewport.top + padding;
  const maxWidth = Math.max(0, viewport.width - padding * 2);
  const maxHeight = Math.max(0, viewport.height - padding * 2);
  const width = Math.min(size.width, maxWidth);
  const height = Math.min(size.height, maxHeight);
  const right = minLeft + maxWidth;
  const bottom = minTop + maxHeight;
  let left = anchor.left;
  let top = anchor.bottom + gap;

  if (placement === "top" || placement === "top-start") {
    if (placement === "top") left = anchor.left + (anchor.width - width) / 2;
    top = anchor.top - height - gap;
    if (top < minTop) top = anchor.bottom + gap;
  } else if (placement === "left-start") {
    left = anchor.left - width - gap;
    top = anchor.top;
    if (left < minLeft) left = anchor.right + gap;
  } else if (top + height > bottom && anchor.top - height - gap >= minTop) {
    top = anchor.top - height - gap;
  }

  return {
    left: Math.max(minLeft, Math.min(left + offset.x, right - width)),
    top: Math.max(minTop, Math.min(top + offset.y, bottom - height)),
    maxWidth,
    maxHeight,
  };
}
