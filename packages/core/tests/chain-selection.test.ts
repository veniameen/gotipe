import { describe, expect, it } from "vitest";
import { chainSelection, mayMoveSelection } from "../src/commands/chain-selection";
import type { Selection, Step } from "../src/types/state";
import type { BlockView } from "../src/types/view";

const view = (
  id: string,
  content: BlockView["content"],
  children: BlockView[] = [],
): BlockView => ({
  id,
  type: "paragraph",
  attrs: {},
  content,
  children,
  decorations: [],
});
const text = (id: string, value: string, children: BlockView[] = []) =>
  view(id, value ? [{ text: value, marks: [] }] : [], children);
const map = (staged: Selection, before: BlockView[], after: BlockView[], steps: Step[] = []) =>
  chainSelection(staged, steps, before, after);

describe("chainSelection (D-07)", () => {
  const before = [text("a", "один"), text("b", "два"), text("c", "три")];

  it("returns a selection that still fits as the same object", () => {
    const staged: Selection = { type: "text", blockId: "b", from: 1, to: 3 };
    expect(map(staged, before, before)).toBe(staged);
  });

  it("moves an offset past the shortened text to its end", () => {
    expect(map({ type: "cursor", blockId: "a", offset: 4 }, before, [text("a", "од")])).toEqual({
      type: "cursor",
      blockId: "a",
      offset: 2,
    });
  });

  it("follows merges into the target after the text it had, and passes over blocks without text", () => {
    const steps: Step[] = [{ type: "mergeBlocks", blockId: "b", targetId: "a" }];
    const range: Selection = {
      type: "range",
      anchor: { blockId: "b", offset: 1 },
      head: { blockId: "c", offset: 2 },
    };
    expect(map(range, before, [text("a", "одиндва"), text("c", "три")], steps)).toEqual({
      type: "range",
      anchor: { blockId: "a", offset: 5 },
      head: { blockId: "c", offset: 2 },
    });
    const list = [text("a", "один"), view("list", null, [text("item", "пункт")])];
    expect(map({ type: "cursor", blockId: "a", offset: 1 }, list, [list[1]!])).toEqual({
      type: "cursor",
      blockId: "item",
      offset: 0,
    });
  });

  it("keeps a text selection whole when its block merges into another", () => {
    const staged: Selection = { type: "text", blockId: "b", from: 0, to: 3 };
    const steps: Step[] = [{ type: "mergeBlocks", blockId: "b", targetId: "a" }];
    expect(map(staged, before, [text("a", "одиндва"), text("c", "три")], steps)).toEqual({
      type: "text",
      blockId: "a",
      from: 4,
      to: 7,
    });
  });

  it("keeps the selected blocks that remain, and gives up when no block or text remains", () => {
    const multi: Selection = { type: "multi", blockIds: ["a", "b"] };
    expect(map(multi, before, [text("b", "два")])).toEqual({ type: "multi", blockIds: ["b"] });
    expect(map(multi, before, [text("c", "три")])).toBeUndefined();
    const divider = view("d", null);
    expect(map({ type: "cursor", blockId: "a", offset: 0 }, before, [divider])).toBeUndefined();
  });

  it("needs the result only after steps that remove a block or shorten text", () => {
    expect(mayMoveSelection([])).toBe(false);
    expect(
      mayMoveSelection([
        { type: "insertText", blockId: "a", offset: 0, text: "x", marks: [] },
        { type: "setBlockAttrs", blockId: "a", attrs: {} },
        { type: "moveBlock", blockId: "a", newParentId: null, newIndex: 1 },
      ]),
    ).toBe(false);
    expect(mayMoveSelection([{ type: "deleteBlock", blockId: "a" }])).toBe(true);
    expect(mayMoveSelection([{ type: "splitBlock", blockId: "a", offset: 1 }])).toBe(true);
    expect(
      mayMoveSelection([{ type: "setBlockType", blockId: "a", newType: "divider", attrs: {} }]),
    ).toBe(true);
  });

  it("leaves a selection the chain cannot have spoiled for the dispatch to reject", () => {
    const unknown: Selection = { type: "cursor", blockId: "nowhere", offset: 0 };
    expect(map(unknown, before, before)).toBe(unknown);
    const negative: Selection = { type: "cursor", blockId: "b", offset: -1 };
    expect(map(negative, before, [text("a", "один")])).toBe(negative);
  });
});
