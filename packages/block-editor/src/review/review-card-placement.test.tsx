// @vitest-environment jsdom
import type { ReviewComment } from "@gotipe/suggestions";
import { act, createRef } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageEditor, type PageEditorHandle } from "../page/page-editor";
import type { ReviewCardPlacement } from "./review-layer";

let container: HTMLDivElement;
let root: Root;
let row = { top: 300, bottom: 320 };
let cardHeight = 116;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const original = Element.prototype.getBoundingClientRect;

class NoResize {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("ResizeObserver", NoResize);
  vi.stubGlobal("CSS", { escape: (value: string) => value.replace(/["\\]/g, "\\$&") });
  // a narrow window: no room for the card beside the text
  vi.stubGlobal("innerWidth", 300);
  vi.stubGlobal("innerHeight", 800);
  const zero = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Range.prototype.getBoundingClientRect = () => ({ ...zero, toJSON() {} }) as DOMRect;
  Range.prototype.getClientRects = () => [zero] as unknown as DOMRectList;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const box = this.matches("[data-gotipe-comment]")
      ? { ...zero, left: 20, right: 120, width: 100, ...row, height: row.bottom - row.top }
      : this.matches(".gotipe-review-card")
        ? { ...zero, width: 288, height: cardHeight }
        : zero;
    return { ...box, toJSON() {} } as DOMRect;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Element.prototype.getBoundingClientRect = original;
  vi.unstubAllGlobals();
});

const comment: ReviewComment = {
  id: "c1",
  laneId: "agent",
  anchor: { before: "The ", quote: "quick", after: " brown" },
  text: "Is it quick?",
};

async function cardTop(placement?: ReviewCardPlacement) {
  const ref = createRef<PageEditorHandle>();
  await act(async () => {
    root.render(
      <PageEditor
        ref={ref}
        markdown={"# Notes\n\nThe quick brown fox.\n"}
        locale="en"
        reviewCardPlacement={placement}
        review={{
          lanes: [{ id: "agent", name: "Agent", kind: "agent" }],
          proposals: [],
          comments: [comment],
        }}
      />,
    );
    await wait(60);
  });
  await act(async () => {
    ref.current?.review?.focus("c1");
    await wait(30);
  });
  const card = document.querySelector<HTMLElement>('[data-gotipe-review-card="comment"]');
  expect(card?.style.position).toBe("fixed");
  return Number.parseFloat(card!.style.top);
}

describe("reviewCardPlacement on a narrow page", () => {
  it("opens below the row by default, above it when the window has no room below", async () => {
    expect(await cardTop()).toBe(328);
    act(() => root.unmount());
    root = createRoot(container);
    row = { top: 700, bottom: 720 };
    // above by the card's measured height: 700 - 116 - 8
    expect(await cardTop("below")).toBe(576);
  });

  it('"above" opens above the row, below it when there is no room above', async () => {
    row = { top: 300, bottom: 320 };
    // the card's bottom stays 8 px above the row whatever its height (P47)
    expect(await cardTop("above")).toBe(300 - 116 - 8);
    act(() => root.unmount());
    root = createRoot(container);
    cardHeight = 158;
    expect(await cardTop("above")).toBe(300 - 158 - 8);
    cardHeight = 116;
    act(() => root.unmount());
    root = createRoot(container);
    row = { top: 100, bottom: 120 };
    expect(await cardTop("above")).toBe(128);
  });

  it("keeps --gt-review-card-gap from the row on either side", async () => {
    const sheet = document.createElement("style");
    sheet.textContent = "[data-gt-view] { --gt-review-card-gap: 6px; }";
    document.head.append(sheet);
    try {
      row = { top: 300, bottom: 320 };
      expect(await cardTop("above")).toBe(300 - 116 - 6);
      act(() => root.unmount());
      root = createRoot(container);
      expect(await cardTop("below")).toBe(320 + 6);
    } finally {
      sheet.remove();
    }
  });
});
