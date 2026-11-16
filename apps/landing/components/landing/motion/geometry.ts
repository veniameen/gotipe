/** The beams of the stack diagram: curves between two boxes of the page. Pure, no DOM. */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The middle of a box, relative to the origin of another (the diagram). */
export function centerOf(box: Box, origin: Box): Point {
  return { x: box.left - origin.left + box.width / 2, y: box.top - origin.top + box.height / 2 };
}

/**
 * An S-curve from `a` to `b` that leaves and enters along the diagram's axis: across a row when the
 * diagram runs left to right, down a column when it is stacked (a phone). The control points sit
 * halfway along that axis, so parallel beams never cross before they meet.
 */
export function beamPath(a: Point, b: Point, axis: "x" | "y"): string {
  const round = (value: number) => Math.round(value * 10) / 10;
  if (axis === "x") {
    const mid = (b.x - a.x) / 2;
    return `M${round(a.x)} ${round(a.y)} C${round(a.x + mid)} ${round(a.y)} ${round(b.x - mid)} ${round(b.y)} ${round(b.x)} ${round(b.y)}`;
  }
  const mid = (b.y - a.y) / 2;
  return `M${round(a.x)} ${round(a.y)} C${round(a.x)} ${round(a.y + mid)} ${round(b.x)} ${round(b.y - mid)} ${round(b.x)} ${round(b.y)}`;
}
