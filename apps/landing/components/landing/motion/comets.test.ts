import { describe, expect, it } from "vitest";
import {
  COMET_PHASES,
  beatKeyframes,
  cometKeyframes,
  flashKeyframes,
  parseBezier,
  posesAlong,
  timeOfProgress,
  toMs,
} from "./comets";
import { beamCurve, beamPath, pathOf } from "./geometry";

const EASE = [0.22, 0.61, 0.36, 1] as const;
const curve = beamCurve({ x: 0, y: 0 }, { x: 300, y: 120 }, "x");

describe("posesAlong", () => {
  it("starts and ends where the beam does", () => {
    const poses = posesAlong(curve, 16);
    expect(poses).toHaveLength(17);
    expect(poses[0].x).toBeCloseTo(0);
    expect(poses[0].y).toBeCloseTo(0);
    expect(poses[16].x).toBeCloseTo(300);
    expect(poses[16].y).toBeCloseTo(120);
  });

  it("spaces the poses evenly by length", () => {
    const poses = posesAlong(curve, 16);
    const gaps = poses
      .slice(1)
      .map((pose, at) => Math.hypot(pose.x - poses[at].x, pose.y - poses[at].y));
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.05);
  });

  it("leaves and arrives along the diagram's axis", () => {
    const poses = posesAlong(curve, 16);
    expect(poses[0].angle).toBeCloseTo(0, 0);
    expect(poses[16].angle).toBeCloseTo(0, 0);
    expect(poses[8].angle).toBeGreaterThan(10);
  });

  it("never turns a full circle between two poses", () => {
    const down = posesAlong(beamCurve({ x: 0, y: 0 }, { x: -200, y: 300 }, "y"), 16);
    for (let at = 1; at < down.length; at += 1)
      expect(Math.abs(down[at].angle - down[at - 1].angle)).toBeLessThan(90);
  });
});

describe("timing", () => {
  it("reads a cubic-bezier", () => {
    expect(parseBezier("cubic-bezier(0.22, 0.61, 0.36, 1)")).toEqual([0.22, 0.61, 0.36, 1]);
    expect(parseBezier("ease")).toBeNull();
  });

  it("finds when a timing function reaches a progress", () => {
    expect(timeOfProgress([0, 0, 1, 1], 0.3)).toBeCloseTo(0.3, 3);
    expect(timeOfProgress(EASE, 0)).toBeCloseTo(0, 3);
    expect(timeOfProgress(EASE, 1)).toBeCloseTo(1, 3);
    // an ease-out covers half the way in less than half the time
    expect(timeOfProgress(EASE, 0.5)).toBeLessThan(0.4);
  });

  it("reads CSS durations", () => {
    expect(toMs("5.6s", 0)).toBe(5600);
    expect(toMs(" 300ms", 0)).toBe(300);
    expect(toMs("", 42)).toBe(42);
  });
});

describe("keyframes", () => {
  const comet = { width: 72, height: 2 };
  const offsets = (frames: Keyframe[]) => frames.map((frame) => frame.offset ?? 0);

  it("runs a comet in during the first half and holds it at the end", () => {
    const frames = cometKeyframes(curve, "in", EASE, comet, "ease");
    const at = offsets(frames);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(Math.min(...at)).toBe(0);
    expect(Math.max(...at)).toBe(1);
    const moves = frames.filter((frame) => frame.transform);
    expect(moves[0].transform).toBe("translate(0px, 0px) rotate(0deg) translate(-72px, -1px)");
    expect(moves.at(-2)?.offset).toBeCloseTo(COMET_PHASES.in.to);
  });

  it("waits for the second half before a comet runs out", () => {
    const frames = cometKeyframes(curve, "out", EASE, comet, "ease");
    const moves = frames.filter((frame) => frame.transform);
    expect(moves[0].offset).toBe(0);
    expect(moves[1].offset).toBeCloseTo(COMET_PHASES.out.from);
    const shown = frames.filter((frame) => frame.opacity === 1).map((frame) => frame.offset);
    expect(shown).toEqual([COMET_PHASES.out.shown, COMET_PHASES.out.fading]);
  });

  it("flashes a box as its comet leaves or arrives, and beats the engine between", () => {
    expect(flashKeyframes("in")[0].opacity).toBe(1);
    expect(flashKeyframes("out").find((frame) => frame.opacity === 1)?.offset).toBe(0.92);
    expect(beatKeyframes("ease-out").find((frame) => frame.opacity === 1)?.offset).toBe(0.46);
  });
});

describe("beam curve", () => {
  it("draws the same path the comets follow", () => {
    expect(pathOf(curve)).toBe(beamPath({ x: 0, y: 0 }, { x: 300, y: 120 }, "x"));
  });
});
