import { describe, expect, it } from "vitest";
import { type ChipState, chipSide } from "./chip-side";

const page = { left: 100, right: 700 };
/** A flag 120 wide drawn 10 after its cursor, or with its right edge at the cursor. */
const onEnd = (cursor: number) => ({ left: cursor + 10, right: cursor + 130, width: 120 });
const onStart = (cursor: number) => ({ left: cursor - 120, right: cursor, width: 120 });

describe("chipSide: which side of its cursor a flag stands on", () => {
  it("stays after the cursor while it is inside the page, and remembers where it stood", () => {
    expect(chipSide(undefined, 300, onEnd(300), page)).toEqual({ side: "end", offset: 10 });
    expect(chipSide({ side: "end", offset: 10 }, 570, onEnd(570), page)).toEqual({
      side: "end",
      offset: 10,
    });
  });

  it("goes before the cursor when it crosses the page's end edge", () => {
    expect(chipSide({ side: "end", offset: 10 }, 571, onEnd(571), page)).toEqual({
      side: "start",
      offset: 10,
    });
  });

  it("keeps its side at the edge: it comes back only with room to spare", () => {
    let known: ChipState = { side: "start", offset: 10 };
    // it would fit again by a pixel, by ten: not enough to change sides
    for (const cursor of [570, 565, 559]) {
      known = chipSide(known, cursor, onStart(cursor), page);
      expect(known.side).toBe("start");
    }
    known = chipSide(known, 558, onStart(558), page);
    expect(known).toEqual({ side: "end", offset: 10 });
    // and it does not leave again until it really crosses the edge
    expect(chipSide(known, 570, onEnd(570), page).side).toBe("end");
  });

  it("follows a wider page and a longer flag", () => {
    const flipped: ChipState = { side: "start", offset: 10 };
    expect(chipSide(flipped, 600, onStart(600), { left: 100, right: 760 }).side).toBe("end");
    // the flag grew while it stood before the cursor: its new width counts
    const wide = { left: 300, right: 600, width: 300 };
    expect(chipSide(flipped, 600, wide, { left: 100, right: 760 }).side).toBe("start");
  });

  it("stays after the cursor when there is no room before it either", () => {
    expect(chipSide(undefined, 150, onEnd(650), { left: 100, right: 700 }).side).toBe("end");
    const narrow = { left: 160, right: 280, width: 120 };
    expect(chipSide(undefined, 150, narrow, { left: 100, right: 200 }).side).toBe("end");
  });
});
