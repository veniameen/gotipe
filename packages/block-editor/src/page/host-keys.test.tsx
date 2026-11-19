// @vitest-environment jsdom
import { act, createRef } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageEditor, type PageEditorHandle, type PageEditorProps } from "./page-editor";

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
  if (!document.elementsFromPoint) document.elementsFromPoint = () => [];
  vi.stubGlobal("CSS", { escape: (value: string) => value.replace(/["\\]/g, "\\$&") });
  // a narrow window: a review card opens by its text
  vi.stubGlobal("innerWidth", 300);
  const rect = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON() {} }) as DOMRect;
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  Element.prototype.scrollIntoView = () => {};
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const markdown = "# Notes\n\nThe quick brown fox.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n";

/** A page with a host's field in its flow; `field` is that field. */
async function mount(props: Partial<PageEditorProps> = {}) {
  const ref = createRef<PageEditorHandle>();
  const draw = (afterBlock?: PageEditorProps["afterBlock"]) =>
    root.render(
      <PageEditor ref={ref} locale="en" markdown={markdown} {...props} afterBlock={afterBlock} />,
    );
  await act(async () => {
    draw();
    await wait(60);
  });
  const paragraph = ref.current!.editor!.getViewState().blocks[1]!;
  await act(async () => {
    draw({ blockId: paragraph.id, node: <input aria-label="Host field" /> });
    await wait(20);
  });
  const field = container.querySelector<HTMLInputElement>("[data-gotipe-block-slot] input")!;
  expect(field.closest("[data-gotipe-host]")).not.toBeNull();
  return { ref, field, text: container.querySelector<HTMLElement>("[data-gotipe-content]")! };
}

/** Dispatches a key and says whether a listener of the host on the document saw it. */
async function press(target: EventTarget, init: KeyboardEventInit) {
  const seen = vi.fn();
  document.addEventListener("keydown", seen);
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
    await wait(30);
  });
  document.removeEventListener("keydown", seen);
  return { event, reached: seen.mock.calls.length === 1 };
}

describe("keys in a host's element inside the page are not the editor's (document listeners)", () => {
  it("Escape leaves an open review card open; from the text it closes the card", async () => {
    const { ref, field, text } = await mount({
      review: {
        lanes: [{ id: "agent", name: "Agent", kind: "agent" }],
        proposals: [
          {
            id: "p1",
            laneId: "agent",
            edits: [{ before: "The ", quote: "quick", after: " brown", text: "slow" }],
          },
        ],
      },
    });
    await act(async () => {
      ref.current!.review!.focus("p1");
      await wait(30);
    });
    const card = () => document.querySelector('[data-gotipe-review-card="proposal"]');
    expect(card()).not.toBeNull();
    expect((await press(field, { key: "Escape" })).reached).toBe(true);
    expect(card()).not.toBeNull();
    await press(text, { key: "Escape" });
    expect(card()).toBeNull();
  });

  it("Mod+F opens no find bar; from the text it does", async () => {
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
    const { field, text } = await mount();
    const find = { key: "f", code: "KeyF", metaKey: true };
    const hosts = await press(field, find);
    expect(hosts.event.defaultPrevented).toBe(false);
    expect(hosts.reached).toBe(true);
    expect(container.querySelector("[data-gotipe-find]")).toBeNull();
    const own = await press(text, find);
    expect(own.event.defaultPrevented).toBe(true);
    expect(container.querySelector("[data-gotipe-find]")).not.toBeNull();
  });

  it("Escape leaves an open table menu open and goes on; elsewhere it closes the menu", async () => {
    const { field } = await mount();
    const handle = container.querySelector<HTMLElement>(".gotipe-column-handle")!;
    await act(async () => {
      handle.click();
      await wait(30);
    });
    const menu = () => document.querySelector("[data-gotipe-column-menu]");
    expect(menu()).not.toBeNull();
    expect((await press(field, { key: "Escape" })).reached).toBe(true);
    expect(menu()).not.toBeNull();
    // the menu takes its own Escape and keeps it from the document's other listeners
    expect((await press(document.body, { key: "Escape" })).reached).toBe(false);
    expect(menu()).toBeNull();
  });
});
