import { describe, expect, it } from "vitest";
import { computeFloatingPosition } from "./floating-position";

const anchor = { left: 280, top: 100, right: 300, bottom: 120, width: 20, height: 20 };
const viewport = { left: 0, top: 0, width: 320, height: 480 };

describe("floating panel positioning", () => {
  it("contains oversized panels inside a narrow viewport", () => {
    const p = computeFloatingPosition(anchor, { width: 360, height: 700 }, viewport);
    expect(p).toEqual({ left: 8, top: 8, maxWidth: 304, maxHeight: 464 });
  });
  it("flips below a selection near the top", () => {
    const p = computeFloatingPosition(
      { ...anchor, top: 4, bottom: 24 },
      { width: 160, height: 32 },
      viewport,
      "top",
    );
    expect(p.top).toBe(30);
    expect(p.left + 160).toBeLessThanOrEqual(312);
  });
  it("top-start stands above the anchor by the panel's own height, left-aligned", () => {
    const at = { left: 20, top: 300, right: 120, bottom: 320, width: 100, height: 20 };
    const box = { left: 0, top: 0, width: 600, height: 800 };
    for (const height of [116, 158]) {
      const p = computeFloatingPosition(at, { width: 288, height }, box, "top-start", 8);
      expect(p).toMatchObject({ left: 20, top: 300 - height - 8 });
    }
    const low = computeFloatingPosition(
      { ...at, top: 60, bottom: 80 },
      { width: 288, height: 116 },
      box,
      "top-start",
      8,
    );
    expect(low.top).toBe(88);
  });
  it("flips above a table header near the bottom", () => {
    const p = computeFloatingPosition(
      { ...anchor, top: 450, bottom: 470 },
      { width: 240, height: 200 },
      viewport,
    );
    expect(p.top).toBe(244);
  });
  it("uses the visible viewport after mobile zoom or keyboard movement", () => {
    const p = computeFloatingPosition(
      anchor,
      { width: 240, height: 200 },
      { left: 50, top: 80, width: 200, height: 180 },
      "left-start",
    );
    expect(p).toEqual({ left: 58, top: 88, maxWidth: 184, maxHeight: 164 });
  });
});
