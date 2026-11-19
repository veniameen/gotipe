import type { BlockView, Decoration } from "@gotipe/core";
import { describe, expect, it } from "vitest";
import { keepDrawn } from "./decorations";

const mark = (key: string): Decoration => ({
  type: "inline",
  key,
  blockId: "b",
  from: 0,
  to: 1,
  className: "mark",
});
const block = (id: string, more: Partial<BlockView> = {}): BlockView => ({
  id,
  type: "paragraph",
  attrs: {},
  content: [{ text: id, marks: [] }],
  children: [],
  decorations: [],
  ...more,
});

describe("keepDrawn: a block that is as it was drawn keeps that object", () => {
  it("gives the blocks back when nothing was drawn yet", () => {
    const blocks = [block("a")];
    expect(keepDrawn(blocks, null)).toBe(blocks);
  });

  it("keeps a decorated block that the view gave a new object with the same decorations", () => {
    const own = [mark("k")];
    const a = block("a", { decorations: own });
    const b = block("b");
    const drawn = [a, b];
    // the same content, attributes and decoration objects in a new object and a new array
    const again = { ...a, decorations: [...own] };
    const kept = keepDrawn([again, b], drawn);
    expect(kept).toBe(drawn);
    expect(kept[0]).toBe(a);
  });

  it("takes the new object when a decoration, the text, an attribute or the render key changed", () => {
    const own = [mark("k")];
    const a = block("a", { decorations: own });
    const drawn = [a];
    for (const changed of [
      { ...a, decorations: [mark("k")] },
      { ...a, decorations: [] },
      { ...a, content: [{ text: "other", marks: [] }] },
      { ...a, attrs: { level: 2 } },
      { ...a, renderKey: 1 },
      { ...a, type: "heading" },
    ]) {
      const kept = keepDrawn([changed], drawn);
      expect(kept).not.toBe(drawn);
      expect(kept[0]).toBe(changed);
    }
  });

  it("keeps the children that did not change under a parent that did", () => {
    const one = block("one", { decorations: [mark("one")] });
    const two = block("two", { decorations: [mark("two")] });
    const list = block("list", { type: "bulletList", content: null, children: [one, two] });
    const drawn = [list];
    const changed = { ...two, decorations: [mark("two")] };
    const next = { ...list, children: [{ ...one, decorations: [...one.decorations] }, changed] };
    const kept = keepDrawn([next], drawn);
    expect(kept[0]).not.toBe(list);
    expect(kept[0]!.children[0]).toBe(one);
    expect(kept[0]!.children[1]).toBe(changed);
    // the same tree again: the list itself is kept
    const same = { ...list, children: [{ ...one }, { ...two }] };
    expect(keepDrawn([same], drawn)).toBe(drawn);
  });

  it("compares place by place: a block that moved is a new one there", () => {
    const a = block("a", { decorations: [mark("a")] });
    const b = block("b");
    const drawn = [a, b];
    const moved = [b, { ...a, decorations: [...a.decorations] }];
    const kept = keepDrawn(moved, drawn);
    expect(kept).not.toBe(drawn);
    expect(kept).toEqual(moved);
    expect(kept[0]).toBe(b);
    // one more block at the end: the others are kept
    const more = keepDrawn([a, b, block("c")], drawn);
    expect(more.slice(0, 2)).toEqual([a, b]);
    expect(more).toHaveLength(3);
  });
});
