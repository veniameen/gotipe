import { describe, expect, it } from "vitest";
import { compositionChange, installComposition } from "../src/input/composition";

describe("native composition ownership", () => {
  it("replaces entire Unicode scalars when two emoji share a surrogate prefix", () => {
    expect(compositionChange("a😀b", "a😁b")).toEqual({ from: 1, to: 3, text: "😁" });
  });

  it("commits fallback input at the initial caret after renderer selection changes", () => {
    const element = document.createElement("div");
    element.innerHTML = '<p data-block-id="a">before</p>';
    const abort = new AbortController();
    const commits: unknown[] = [];
    let offset = 6;
    const controller = installComposition(element, abort.signal, {
      isEditable: () => true,
      prepareSelection: () => ({
        anchor: { blockId: "a", offset },
        head: { blockId: "a", offset },
      }),
      getBlock: () => ({ type: "paragraph", content: [{ text: "before" }] }),
      getDocument: () => ({ version: 1, blocks: [{ id: "a", type: "paragraph", attrs: {}, content: [{ text: "before", marks: [] }], children: [] }] }),
      restoreSelection() {},
      getMarks: () => [],
      commit: (steps, caret) => commits.push({ steps, caret }),
      reportError: (error) => {
        throw error;
      },
    });
    element.dispatchEvent(new CompositionEvent("compositionstart"));
    expect(controller.blockId).toBe("a");
    offset = 0;
    element.dispatchEvent(new CompositionEvent("compositionend", { data: "漢" }));
    expect(commits).toEqual([
      {
        steps: [{ type: "insertText", blockId: "a", offset: 6, text: "漢", marks: [] }],
        caret: { blockId: "a", offset: 7 },
      },
    ]);
    expect(controller.blockId).toBeNull();
    abort.abort();
    element.dispatchEvent(new CompositionEvent("compositionstart"));
    expect(controller.blockId).toBeNull();
  });
});
