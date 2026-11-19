import { describe, expect, it } from "vitest";
import { followPlace, mapOffset } from "./page-bookmark";

describe("mapOffset: a place in a block's text through an edit", () => {
  it("moves with edits before it and stays with edits after it", () => {
    expect(mapOffset("Hello world", "Oh, Hello world", 5, "after")).toBe(9);
    expect(mapOffset("Hello world", "Hello", 3, "after")).toBe(3);
    expect(mapOffset("Hello world", "Hello there world", 11, "after")).toBe(17);
    expect(mapOffset("Привет 👋 мир", "Привет мир", 12, "after")).toBe(9);
  });
  it("text typed right at it goes before it with after, after it with before", () => {
    expect(mapOffset("ab", "aXYb", 1, "after")).toBe(3);
    expect(mapOffset("ab", "aXYb", 1, "before")).toBe(1);
  });
  it("at an edge of replaced text it keeps that edge; inside it, it is lost", () => {
    expect(mapOffset("one two three", "one 2 three", 4, "after")).toBe(4);
    expect(mapOffset("one two three", "one 2 three", 7, "after")).toBe(5);
    expect(mapOffset("one two three", "one 2 three", 5, "after")).toBeNull();
  });
  it("an unchanged text keeps it", () => {
    expect(mapOffset("same", "same", 2, "before")).toBe(2);
  });
});

describe("followPlace: a place through a split, a join and a lost block", () => {
  const doc = (...pairs: [string, string][]) => new Map(pairs);
  it("follows its text into the new block of a split", () => {
    const before = doc(["a", "Hello world"]);
    const after = doc(["a", "Hello "], ["n", "world"]);
    expect(followPlace(before, after, { blockId: "a", offset: 9 }, "after")).toEqual({
      blockId: "n",
      offset: 3,
    });
    // before the cut it stays; at the cut, as text typed at it: after goes on, before stays
    expect(followPlace(before, after, { blockId: "a", offset: 2 }, "after")).toEqual({
      blockId: "a",
      offset: 2,
    });
    expect(followPlace(before, after, { blockId: "a", offset: 6 }, "after")).toEqual({
      blockId: "n",
      offset: 0,
    });
    expect(followPlace(before, after, { blockId: "a", offset: 6 }, "before")).toEqual({
      blockId: "a",
      offset: 6,
    });
  });
  it("follows its text into the block before when the two are joined", () => {
    const before = doc(["a", "Hello "], ["b", "world"]);
    const after = doc(["a", "Hello world"]);
    expect(followPlace(before, after, { blockId: "b", offset: 3 }, "after")).toEqual({
      blockId: "a",
      offset: 9,
    });
  });
  it("stays at the end of its block when the next block is joined to it", () => {
    const before = doc(["a", "Hello "], ["b", "world"]);
    const after = doc(["a", "Hello world"]);
    expect(followPlace(before, after, { blockId: "a", offset: 6 }, "after")).toEqual({
      blockId: "a",
      offset: 6,
    });
  });
  it("finds the new block of a split past nested blocks", () => {
    const before = doc(["item", "one two"], ["child", "nested"]);
    const after = doc(["item", "one "], ["child", "nested"], ["new", "two"]);
    expect(followPlace(before, after, { blockId: "item", offset: 5 }, "after")).toEqual({
      blockId: "new",
      offset: 1,
    });
  });
  it("is lost with its block", () => {
    expect(
      followPlace(
        doc(["a", "x"], ["b", "y"]),
        doc(["a", "x"]),
        { blockId: "b", offset: 1 },
        "after",
      ),
    ).toBeNull();
  });
});
