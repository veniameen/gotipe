/**
 * The stack's motion as keyframes for the compositor: a comet carried along its beam by transform
 * (a motion path would be animated on the main thread), the boxes' flashes and the engine's beat.
 * Pure, no DOM: the curve, the timing and the comet's size come in, keyframes go out.
 */
import type { Cubic, Point } from "./geometry";

/** A place on a curve and the curve's direction there, in degrees. */
export interface Pose extends Point {
  angle: number;
}

/** A CSS timing function's control points: cubic-bezier(x1, y1, x2, y2). */
export type Bezier = readonly [number, number, number, number];

export type Tone = "in" | "out";

/**
 * When, as shares of the cycle, a comet runs along its beam and fades in and out: into the engine
 * in the first half, out of it in the second, so the engine passes the light on.
 */
export const COMET_PHASES: Record<
  Tone,
  { from: number; to: number; shown: number; fading: number }
> = {
  in: { from: 0, to: 0.42, shown: 0.04, fading: 0.38 },
  out: { from: 0.5, to: 0.92, shown: 0.54, fading: 0.88 },
};

/** Points along the curve at which a comet's place is set: the frames between are straight. */
const POSES = 32;
/** Steps of the table that measures the curve's length. */
const MEASURE = 96;

function at(curve: Cubic, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * curve.a.x + b * curve.c1.x + c * curve.c2.x + d * curve.b.x,
    y: a * curve.a.y + b * curve.c1.y + c * curve.c2.y + d * curve.b.y,
  };
}

function slope(curve: Cubic, t: number): Point {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const c = 3 * t * t;
  return {
    x: a * (curve.c1.x - curve.a.x) + b * (curve.c2.x - curve.c1.x) + c * (curve.b.x - curve.c2.x),
    y: a * (curve.c1.y - curve.a.y) + b * (curve.c2.y - curve.c1.y) + c * (curve.b.y - curve.c2.y),
  };
}

/**
 * `count + 1` poses spaced evenly by length from the curve's start to its end. Angles never jump
 * by a turn between neighbours, so the frames between them turn the short way.
 */
export function posesAlong(curve: Cubic, count = POSES): Pose[] {
  const lengths = [0];
  let previous = at(curve, 0);
  for (let step = 1; step <= MEASURE; step += 1) {
    const point = at(curve, step / MEASURE);
    lengths.push(lengths[step - 1] + Math.hypot(point.x - previous.x, point.y - previous.y));
    previous = point;
  }
  const total = lengths[MEASURE];
  const poses: Pose[] = [];
  let step = 1;
  let turned = 0;
  for (let index = 0; index <= count; index += 1) {
    const wanted = (index / count) * total;
    while (step < MEASURE && lengths[step] < wanted) step += 1;
    const span = lengths[step] - lengths[step - 1];
    const share = span > 0 ? (wanted - lengths[step - 1]) / span : 0;
    const t = Math.min(1, (step - 1 + share) / MEASURE);
    const point = at(curve, t);
    const direction = slope(curve, t);
    let angle = (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
    if (index > 0) {
      while (angle - turned > 180) angle -= 360;
      while (angle - turned < -180) angle += 360;
    }
    turned = angle;
    poses.push({ x: point.x, y: point.y, angle });
  }
  return poses;
}

/** `cubic-bezier(x1, y1, x2, y2)` → its four numbers, or null. */
export function parseBezier(text: string): Bezier | null {
  const match = /cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/.exec(text);
  if (!match) return null;
  const values = match.slice(1, 5).map(Number);
  return values.every(Number.isFinite) ? (values as unknown as Bezier) : null;
}

/** The share of the time at which a timing function reaches `progress` (both 0..1). */
export function timeOfProgress(bezier: Bezier, progress: number): number {
  const [x1, y1, x2, y2] = bezier;
  const curve = (p1: number, p2: number, s: number) =>
    3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s * s * s;
  let low = 0;
  let high = 1;
  for (let round = 0; round < 40; round += 1) {
    const middle = (low + high) / 2;
    if (curve(y1, y2, middle) < progress) low = middle;
    else high = middle;
  }
  return curve(x1, x2, (low + high) / 2);
}

/** CSS seconds or milliseconds (`5.6s`, `300ms`) → milliseconds, or `fallback`. */
export function toMs(text: string, fallback: number): number {
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) return fallback;
  return text.trim().endsWith("ms") ? value : value * 1000;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * A comet's keyframes: its head on the beam at each pose, turned along it (the comet is `width`
 * by `height`, its head at the right end of its middle), the travel eased by `ease` as the
 * stylesheet's own transitions are; it fades in as it leaves and out before it arrives.
 */
export function cometKeyframes(
  curve: Cubic,
  tone: Tone,
  ease: Bezier,
  comet: { width: number; height: number },
  css: string,
): Keyframe[] {
  const phase = COMET_PHASES[tone];
  const poses = posesAlong(curve);
  const place = (pose: Pose) =>
    `translate(${round(pose.x)}px, ${round(pose.y)}px) rotate(${round(pose.angle)}deg) translate(${-comet.width}px, ${-comet.height / 2}px)`;
  const frames: Keyframe[] = poses.map((pose, index) => ({
    offset: phase.from + (phase.to - phase.from) * timeOfProgress(ease, index / (poses.length - 1)),
    transform: place(pose),
  }));
  if (phase.from > 0) frames.unshift({ offset: 0, transform: place(poses[0]) });
  frames.push({ offset: 1, transform: place(poses[poses.length - 1]) });
  const fade: Keyframe[] = [
    { offset: 0, opacity: 0 },
    { offset: phase.from, opacity: 0, easing: css },
    { offset: phase.shown, opacity: 1 },
    { offset: phase.fading, opacity: 1, easing: css },
    { offset: phase.to, opacity: 0 },
    { offset: 1, opacity: 0 },
  ];
  return [...frames, ...fade].sort((one, two) => (one.offset ?? 0) - (two.offset ?? 0));
}

/** A box's flash: as its comet leaves (an interface) or arrives (the infrastructure). */
export function flashKeyframes(tone: Tone): Keyframe[] {
  return tone === "in"
    ? [
        { offset: 0, opacity: 1 },
        { offset: 0.16, opacity: 0 },
        { offset: 1, opacity: 0 },
      ]
    : [
        { offset: 0, opacity: 0 },
        { offset: 0.86, opacity: 0 },
        { offset: 0.92, opacity: 1 },
        { offset: 1, opacity: 0 },
      ];
}

/** The engine's beat as the comets come in, eased out by `css`. */
export function beatKeyframes(css: string): Keyframe[] {
  return [
    { offset: 0, opacity: 0 },
    { offset: 0.34, opacity: 0, easing: css },
    { offset: 0.46, opacity: 1, easing: css },
    { offset: 0.62, opacity: 0 },
    { offset: 1, opacity: 0 },
  ];
}
