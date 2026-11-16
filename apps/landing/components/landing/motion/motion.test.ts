import { describe, expect, it } from "vitest";
import { easeOut, figureAt, figureParts } from "./figures";
import { beamPath, centerOf } from "./geometry";

describe("figures", () => {
  it("splits a figure into numbers and the text between them", () => {
    expect(figureParts("652 / 652")).toEqual([652, " / ", 652]);
    expect(figureParts("~127 KB")).toEqual(["~", 127, " KB"]);
    expect(figureParts("1 service")).toEqual([1, " service"]);
    expect(figureParts("MIT")).toEqual(["MIT"]);
  });

  it("counts every number from zero and lands exactly on the figure", () => {
    const parts = figureParts("652 / 652");
    expect(figureAt(parts, 0)).toBe("0 / 0");
    expect(figureAt(parts, 1)).toBe("652 / 652");
    expect(figureAt(figureParts("~127 KB"), 1)).toBe("~127 KB");
    expect(figureAt(figureParts("0"), 0.5)).toBe("0");
  });

  it("eases out and stays within 0 and 1", () => {
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});

describe("beams", () => {
  it("measures a box's middle from the diagram's corner", () => {
    const diagram = { left: 100, top: 50, width: 800, height: 400 };
    expect(centerOf({ left: 120, top: 60, width: 40, height: 20 }, diagram)).toEqual({
      x: 40,
      y: 20,
    });
  });

  it("leaves and enters along the axis of the diagram", () => {
    expect(beamPath({ x: 0, y: 0 }, { x: 100, y: 40 }, "x")).toBe("M0 0 C50 0 50 40 100 40");
    expect(beamPath({ x: 10, y: 0 }, { x: 30, y: 80 }, "y")).toBe("M10 0 C10 40 30 40 30 80");
  });
});
