// @vitest-environment jsdom
import type { BlockView } from "@gotipe/core";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocsOutline, currentHeadingIndex, outlineHeadings } from "./docs-outline";

const block = (id: string, type: string, text: string, attrs: Record<string, unknown> = {}) => ({
  id,
  type,
  attrs,
  content: [{ text, marks: [] }],
  children: [],
});
const heading = (id: string, level: number, text: string) => block(id, "heading", text, { level });
const doc = (...blocks: ReturnType<typeof block>[]) => ({ version: 1, blocks });

describe("outlineHeadings", () => {
  const view = (...blocks: ReturnType<typeof block>[]) =>
    blocks.map((item) => ({ ...item, decorations: [] })) as BlockView[];

  it("skips the page title: an h1 that is the very first block", () => {
    const blocks = view(
      heading("title", 1, "Offline drafts"),
      block("intro", "paragraph", "Editing without a network"),
      heading("how", 1, "How it works"),
      heading("what", 2, "What changes"),
      heading("order", 3, "Rollout order"),
      heading("deep", 4, "Details"),
      heading("empty", 2, "  "),
    );
    expect(outlineHeadings(blocks)).toEqual([
      { id: "how", level: 1, text: "How it works" },
      { id: "what", level: 2, text: "What changes" },
      { id: "order", level: 3, text: "Rollout order" },
    ]);
  });

  it("keeps a first heading that is not an h1 and an h1 after other blocks", () => {
    expect(outlineHeadings(view(heading("a", 2, "Start"), heading("b", 1, "Next")))).toEqual([
      { id: "a", level: 2, text: "Start" },
      { id: "b", level: 1, text: "Next" },
    ]);
    const spans = {
      ...heading("c", 3, ""),
      content: [
        { text: "Code ", marks: [] },
        { text: "and 🙂", marks: [] },
      ],
    };
    expect(
      outlineHeadings(view(block("p", "paragraph", "x"), heading("t", 1, "Title"), spans)),
    ).toEqual([
      { id: "t", level: 1, text: "Title" },
      { id: "c", level: 3, text: "Code and 🙂" },
    ]);
  });
});

describe("currentHeadingIndex", () => {
  it("marks the last heading above the reading line, the first before any", () => {
    expect(currentHeadingIndex([300, 900, 1500], 200)).toBe(0);
    expect(currentHeadingIndex([-400, 120, 700], 200)).toBe(1);
    expect(currentHeadingIndex([-900, -300, 200], 200)).toBe(2);
  });

  it("marks the last heading at the scroller's end and nothing without headings", () => {
    expect(currentHeadingIndex([-400, 120, 700], 200, true)).toBe(2);
    expect(currentHeadingIndex([], 200)).toBe(-1);
  });
});

describe("DocsOutline", () => {
  let editor: GoTipeEditor;
  let container: HTMLDivElement;
  let surface: HTMLDivElement;
  let root: Root;
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    surface = document.createElement("div");
    document.body.append(container, surface);
    root = createRoot(container);
    editor = await createEditor({
      extensions: [FullPreset],
      content: doc(
        heading("title", 1, "Title"),
        heading("one", 1, "One"),
        block("p", "paragraph", "x"),
      ),
    });
    editor.mount(surface);
  });
  afterEach(() => {
    act(() => root.unmount());
    editor.destroy();
    container.remove();
    surface.remove();
  });
  const links = () => Array.from(container.querySelectorAll<HTMLAnchorElement>("nav a"));

  it("draws nothing for fewer than two headings and follows the document", () => {
    act(() => root.render(<DocsOutline editor={editor} />));
    expect(container.querySelector("nav")).toBeNull();
    act(() =>
      editor.setContent(
        doc(heading("one", 1, "One"), heading("two", 2, "Two"), heading("three", 3, "Three")),
      ),
    );
    const nav = container.querySelector("nav.gotipe-outline");
    expect(nav?.getAttribute("aria-label")).toBe("Page outline");
    expect(nav?.querySelector(".gotipe-outline-title")?.textContent).toBe("On this page");
    expect(links().map((link) => [link.textContent, link.dataset.level])).toEqual([
      ["Two", "2"],
      ["Three", "3"],
    ]);
    expect(links()[0]?.className).toBe("is-current");
    expect(links()[0]?.getAttribute("aria-current")).toBe("location");
    expect(links()[1]?.hasAttribute("aria-current")).toBe(false);
  });

  it("scrolls to the heading, marks it and puts the caret at its start", () => {
    act(() =>
      editor.setContent(
        doc(block("p", "paragraph", "x"), heading("one", 1, "One"), heading("two", 2, "Two")),
      ),
    );
    act(() => root.render(<DocsOutline editor={editor} />));
    // The React content renders the blocks; here the bare surface stands in for it.
    surface.innerHTML = '<h1 data-block-id="one">One</h1><h2 data-block-id="two">Two</h2>';
    const scroll = vi.fn();
    surface.querySelector<HTMLElement>("h2")!.scrollIntoView = scroll;
    act(() =>
      links()[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })),
    );
    expect(scroll).toHaveBeenCalledOnce();
    expect(links()[1]?.getAttribute("aria-current")).toBe("location");
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "two", offset: 0 });
  });

  /** The outline inside a box with `overflow-y: auto`, its heights and its top on the screen. */
  const boxed = (heights: { scroll: number; client: number }) => {
    const box = document.createElement("div");
    box.style.overflowY = "auto";
    document.body.append(box);
    box.append(container);
    Object.defineProperties(box, {
      scrollHeight: { value: heights.scroll },
      clientHeight: { value: heights.client },
      scrollTop: { value: 40 },
    });
    box.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    box.scrollTo = vi.fn() as typeof box.scrollTo;
    return box;
  };
  const clickSecond = () => {
    act(() =>
      editor.setContent(
        doc(block("p", "paragraph", "x"), heading("one", 2, "One"), heading("two", 2, "Two")),
      ),
    );
    act(() => root.render(<DocsOutline editor={editor} />));
    surface.innerHTML = '<h2 data-block-id="one">One</h2><h2 data-block-id="two">Two</h2>';
    const target = surface.querySelector<HTMLElement>('[data-block-id="two"]')!;
    target.getBoundingClientRect = () => ({ top: 700 }) as DOMRect;
    target.scrollIntoView = vi.fn();
    act(() =>
      links()[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })),
    );
    return target;
  };

  it("in a box that scrolls, moves that box to the heading and leaves the page where it is", () => {
    const box = boxed({ scroll: 1200, client: 400 });
    const target = clickSecond();
    expect(box.scrollTo).toHaveBeenCalledWith({ top: 640, behavior: "smooth" });
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    expect(links()[1]?.getAttribute("aria-current")).toBe("location");
    box.remove();
  });

  it("in a box that cannot scroll, scrolls the page to the heading", () => {
    const box = boxed({ scroll: 400, client: 400 });
    const target = clickSecond();
    expect(box.scrollTo).not.toHaveBeenCalled();
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    box.remove();
  });
});
