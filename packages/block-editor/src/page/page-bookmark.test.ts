import { describe, expect, it } from "vitest";
import { mapOffset } from "./page-bookmark";

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
