import { afterEach, describe, expect, it, vi } from "vitest";
import { installRenderCorrection } from "../src/dom/render-correction";
import type { BlockView } from "../src/types/view";

const view = (id: string, value: string | null, children: BlockView[] = []): BlockView => ({
  id,
  type: value === null ? "bulletList" : "paragraph",
  attrs: {},
  content: value === null ? null : [{ text: value, marks: [] }],
  children,
  decorations: [],
});

/** Draws the blocks as a renderer does, each in its own element. */
function draw(blocks: BlockView[], parent: HTMLElement): void {
  for (const block of blocks) {
    const node = document.createElement("div");
    node.dataset.blockId = block.id;
    node.dataset.blockType = block.type;
    if (Array.isArray(block.content)) node.append(block.content.map((span) => span.text).join(""));
    parent.append(node);
    draw(block.children, node);
  }
}

const controllers: AbortController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.abort();
  document.body.replaceChildren();
});

function open(blocks: BlockView[]) {
  const element = document.createElement("div");
  draw(blocks, element);
  document.body.append(element);
  const state = { blocks };
  const redrawn: string[][] = [];
  const controller = new AbortController();
  controllers.push(controller);
  const correction = installRenderCorrection(element, controller.signal, {
    getBlocks: () => state.blocks,
    redrawBlocks: (ids) => redrawn.push(ids),
  });
  const node = (id: string) => element.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
  return { element, state, redrawn, correction, node };
}

const page = () => [
  view("a", "one"),
  view("list", null, [view("i1", "first"), view("i2", "second")]),
  view("b", "two"),
];

describe("the correction of text the browser inserted after handled input", () => {
  it("finds nothing in a document drawn as the model has it", () => {
    const { correction, redrawn } = open(page());
    expect(correction.correct()).toBe(false);
    expect(correction.correct()).toBe(false);
    expect(redrawn).toEqual([]);
  });

  it("redraws a block whose text the browser changed, at any depth", () => {
    const { correction, redrawn, node } = open(page());
    expect(correction.correct()).toBe(false);
    (node("i2").firstChild as Text).data = "secondX";
    expect(correction.correct()).toBe(true);
    node("b").append("leaked");
    node("a").append(document.createElement("b"));
    expect(correction.correct()).toBe(true);
    expect(redrawn).toEqual([["i2"], ["i2", "b"]]);
  });

  it("redraws a block the first check finds changed", () => {
    const { correction, redrawn, node } = open(page());
    node("a").append("!");
    expect(correction.correct()).toBe(true);
    expect(redrawn).toEqual([["a"]]);
  });

  it("redraws a block whose model changed while its element did not", () => {
    const { correction, redrawn, state } = open(page());
    expect(correction.correct()).toBe(false);
    state.blocks = [view("a", "one more"), state.blocks[1]!, state.blocks[2]!];
    expect(correction.correct()).toBe(true);
    expect(redrawn).toEqual([["a"]]);
  });

  it("checks a block again once the renderer has drawn it", () => {
    const { correction, redrawn, state, node } = open(page());
    expect(correction.correct()).toBe(false);
    state.blocks = [state.blocks[0]!, state.blocks[1]!, view("b", "two!")];
    (node("b").firstChild as Text).data = "two!";
    expect(correction.correct()).toBe(false);
    // a block drawn later, and a top-level node put in the place of another
    state.blocks = [...state.blocks, view("c", "three")];
    const fresh = document.createElement("div");
    fresh.dataset.blockId = "c";
    fresh.append("thre");
    node("b").after(fresh);
    expect(correction.correct()).toBe(true);
    expect(redrawn).toEqual([["c"]]);
  });

  it("reads only the blocks that may have changed since the last check", () => {
    const blocks = Array.from({ length: 200 }, (_, index) => view(`p${index}`, `text ${index}`));
    const { correction, element, node } = open(blocks);
    expect(correction.correct()).toBe(false);
    const walkers = vi.spyOn(document, "createTreeWalker");
    const search = vi.spyOn(element, "querySelector");
    const searchAll = vi.spyOn(element, "querySelectorAll");
    expect(correction.correct()).toBe(false);
    expect(walkers).toHaveBeenCalledTimes(0);
    (node("p100").firstChild as Text).data = "text 100";
    search.mockClear();
    expect(correction.correct()).toBe(false);
    expect(walkers).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledTimes(0);
    expect(searchAll).toHaveBeenCalledTimes(0);
    walkers.mockRestore();
  });

  it("stops with the surface", () => {
    const { correction, node } = open(page());
    controllers[0]!.abort();
    node("a").append("!");
    expect(correction.correct()).toBe(false);
  });
});
