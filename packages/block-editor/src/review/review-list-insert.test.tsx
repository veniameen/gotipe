// @vitest-environment jsdom
import type { ReviewProposal } from "@gotipe/suggestions";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageEditor } from "../page/page-editor";

let container: HTMLDivElement;
let root: Root;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class NoResize {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("ResizeObserver", NoResize);
  vi.stubGlobal("CSS", { escape: (value: string) => value.replace(/["\\]/g, "\\$&") });
  const rect = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON() {} }) as DOMRect;
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const markdown = "# T\n\n- one\n- two\n- three\n";

const lanes = [{ id: "agent", name: "Agent", kind: "agent" as const }];
const comments: never[] = [];
async function mount(proposal: ReviewProposal, page = markdown) {
  const review = { lanes, proposals: [proposal], comments };
  await act(async () => {
    root.render(<PageEditor markdown={page} review={review} />);
    await wait(60);
  });
}

const edit = { before: "- one\n", quote: "", after: "- two", text: "- new\n" };
const rows = () =>
  [...container.querySelectorAll('[data-block-type="bulletList"] > li')].map((li) => [
    li.textContent,
    li.hasAttribute("data-gotipe-phantom-id"),
    li.className,
  ]);

describe("a suggested list item (PageEditor review)", () => {
  it("pending: stands as its own item of the list, not in the line before it", async () => {
    await mount({ id: "p1", laneId: "agent", edits: [edit] });
    expect(rows()).toEqual([
      ["one", false, ""],
      ["new", true, "gotipe-sug gotipe-sug-block-ins"],
      ["two", false, ""],
      ["three", false, ""],
    ]);
    // the new item's text alone in a span, for a tint behind the text (--gt-sug-block-ins-text-tint)
    const text = [
      ...container.querySelectorAll("[data-gotipe-phantom-id] .gotipe-sug-block-ins-text"),
    ];
    expect(text.map((span) => span.textContent)).toEqual(["new"]);
  });

  it("stale: stands as its own item too, in the stale look", async () => {
    // the anchored text after the place changed: the proposal is stale, its item keeps a row
    await mount({ id: "p1", laneId: "agent", edits: [edit] }, markdown.replace("two", "zwei"));
    expect(rows()).toEqual([
      ["one", false, ""],
      ["new", true, "gotipe-sug gotipe-sug-stale gotipe-sug-block-ins"],
      ["zwei", false, ""],
      ["three", false, ""],
    ]);
    expect(container.querySelector("li:not([data-gotipe-phantom-id]) .gotipe-sug")).toBeNull();
  });
});
