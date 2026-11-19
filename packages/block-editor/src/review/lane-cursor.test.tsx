// @vitest-environment jsdom
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageEditor } from "../page/page-editor";
import type { ReviewLaneCursor } from "./review-layer";

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
  // the text at the cursor's anchor
  const rect = { x: 50, y: 100, left: 50, top: 100, right: 50, bottom: 120, width: 0, height: 20 };
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

async function cursor(look?: ReviewLaneCursor) {
  await act(async () => {
    root.render(
      <PageEditor
        markdown={"# Notes\n\nThe quick brown fox.\n"}
        locale="en"
        reviewLaneCursor={look}
        review={{
          lanes: [{ id: "agent", name: "Agent", kind: "agent", color: "rgb(1, 2, 3)" }],
          proposals: [],
          cursors: [
            {
              laneId: "agent",
              anchor: { before: "The ", quote: "quick", after: " brown" },
              label: "Writing",
            },
          ],
        }}
      />,
    );
    await wait(60);
  });
  const element = document.querySelector<HTMLElement>(".gotipe-lane-cursor");
  expect(element?.getAttribute("aria-hidden")).toBe("true");
  expect([element?.style.top, element?.style.left, element?.style.height]).toEqual([
    "100px",
    "50px",
    "20px",
  ]);
  expect(element?.style.getPropertyValue("--gt-track")).toBe("rgb(1, 2, 3)");
  expect(element?.querySelector(".gotipe-lane-chip-name")?.textContent).toBe("Agent");
  expect(element?.querySelector(".gotipe-lane-chip-label")?.textContent).toBe("Writing");
  return element!;
}

describe("reviewLaneCursor", () => {
  it("draws a caret with a flag by default", async () => {
    const element = await cursor();
    expect(element.hasAttribute("data-variant")).toBe(false);
    expect(element.querySelector(".gotipe-lane-caret")).not.toBeNull();
    expect(element.querySelector("svg")).toBeNull();
    expect([...element.children].map((child) => child.className)).toEqual([
      "gotipe-lane-caret",
      "gotipe-lane-chip",
    ]);
  });

  it('"pointer" draws an arrow at the same place, then the chip', async () => {
    const element = await cursor("pointer");
    expect(element.getAttribute("data-variant")).toBe("pointer");
    expect(element.querySelector(".gotipe-lane-caret")).toBeNull();
    const arrow = element.querySelector("svg.gotipe-lane-pointer");
    expect(arrow?.getAttribute("aria-hidden")).toBe("true");
    expect(arrow?.querySelector("path")?.getAttribute("fill")).toBe("currentColor");
    expect(element.lastElementChild?.className).toBe("gotipe-lane-chip");
  });
});
