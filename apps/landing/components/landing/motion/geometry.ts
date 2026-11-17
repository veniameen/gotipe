/** The beams of the stack diagram: curves between two boxes of the page. Pure, no DOM. */

export interface Point {
  x: number;
  y: number;
}

/** A cubic Bézier: from `a`, toward `c1` and `c2`, to `b`. */
export interface Cubic {
  a: Point;
  c1: Point;
  c2: Point;
  b: Point;
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
 * halfway along that axis, so parallel beams never cross before they meet. Every coordinate is
 * rounded to a tenth, as the drawn path's are.
 */
export function beamCurve(a: Point, b: Point, axis: "x" | "y"): Cubic {
  const round = (value: number) => Math.round(value * 10) / 10;
  const point = (x: number, y: number) => ({ x: round(x), y: round(y) });
  if (axis === "x") {
    const mid = (b.x - a.x) / 2;
    return {
      a: point(a.x, a.y),
      c1: point(a.x + mid, a.y),
      c2: point(b.x - mid, b.y),
      b: point(b.x, b.y),
    };
  }
  const mid = (b.y - a.y) / 2;
  return {
    a: point(a.x, a.y),
    c1: point(a.x, a.y + mid),
    c2: point(b.x, b.y - mid),
    b: point(b.x, b.y),
  };
}

/** The curve as an SVG path. */
export function pathOf(curve: Cubic): string {
  const { a, c1, c2, b } = curve;
  return `M${a.x} ${a.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
}

/** The beam from `a` to `b` (beamCurve) as an SVG path. */
export function beamPath(a: Point, b: Point, axis: "x" | "y"): string {
  return pathOf(beamCurve(a, b, axis));
}
