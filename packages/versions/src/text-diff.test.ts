import type { Block, Document } from "@gotipe/core";
import { describe, expect, it } from "vitest";
import { countWordChanges, diffText } from "./text-diff";

const paragraph = (id: string, text: string): Block => ({
  id,
  type: "paragraph",
  attrs: {},
  content: text ? [{ text, marks: [] }] : [],
  children: [],
});
const doc = (...blocks: Block[]): Document => ({ version: 1, blocks });

describe("word comparison", () => {
  it("marks the changed words and keeps the rest", () => {
    expect(
      diffText("Включить журнал для 10 % пользователей", "Включить журнал для 5 % пользователей"),
    ).toEqual([
      { type: "equal", text: "Включить журнал для " },
      { type: "delete", text: "10" },
      { type: "insert", text: "5" },
      { type: "equal", text: " % пользователей" },
    ]);
  });
  it("keeps a number and its sign joined by a no-break space as one unit", () => {
    expect(diffText("для 10\u00a0% пользователей", "для 5\u00a0% пользователей")).toEqual([
      { type: "equal", text: "для " },
      { type: "delete", text: "10\u00a0%" },
      { type: "insert", text: "5\u00a0%" },
      { type: "equal", text: " пользователей" },
    ]);
  });
  it("puts a deletion before the insertion of one stretch and glues a kept space into it", () => {
    expect(diffText("a b c d", "a x y d")).toEqual([
      { type: "equal", text: "a " },
      { type: "delete", text: "b c" },
      { type: "insert", text: "x y" },
      { type: "equal", text: " d" },
    ]);
  });
  it("handles empty sides, emoji and equal texts", () => {
    expect(diffText("", "")).toEqual([]);
    expect(diffText("", "новый 😀")).toEqual([{ type: "insert", text: "новый 😀" }]);
    expect(diffText("старый", "")).toEqual([{ type: "delete", text: "старый" }]);
    expect(diffText("тот же", "тот же")).toEqual([{ type: "equal", text: "тот же" }]);
  });
  it("counts words added and removed across added, removed and edited blocks", () => {
    const before = doc(paragraph("a", "one two three"), paragraph("b", "gone block"));
    const after = doc(paragraph("a", "one 2 three four"), paragraph("c", "brand new words"));
    expect(countWordChanges(before, after)).toEqual({ added: 5, removed: 3 });
    expect(countWordChanges(after, after)).toEqual({ added: 0, removed: 0 });
  });
});
