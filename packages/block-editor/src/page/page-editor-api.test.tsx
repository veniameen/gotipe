// @vitest-environment jsdom
import type { GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import { StrictMode, act, createRef, useEffect, useState } from "react";
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
  // jsdom has no hit testing: the block handle's hover looks for nothing under the pointer
  if (!document.elementsFromPoint) document.elementsFromPoint = () => [];
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

async function mount(props: Partial<PageEditorProps> & { markdown: string }) {
  const ref = createRef<PageEditorHandle>();
  let editor: GoTipeEditor | null = null;
  const drafts: string[] = [];
  const draw = (next: Partial<PageEditorProps> = {}) =>
    root.render(
      <PageEditor
        ref={ref}
        locale="en"
        onChange={(markdown) => drafts.push(markdown)}
        onReady={(ready) => {
          editor = ready;
        }}
        {...props}
        {...next}
      />,
    );
  await act(async () => {
    draw();
    await wait(60);
  });
  if (!editor) throw new Error("no editor");
  return { ref, editor: editor as GoTipeEditor, drafts, draw };
}

function typeAtEnd(editor: GoTipeEditor, text: string) {
  const blocks = editor.getViewState().blocks;
  const last = blocks[blocks.length - 1]!;
  const length = Array.isArray(last.content)
    ? last.content.reduce((n, span) => n + span.text.length, 0)
    : 0;
  editor.setSelection({
    anchor: { blockId: last.id, offset: length },
    head: { blockId: last.id, offset: length },
  });
  editor.chain().insertText(text).run();
}

describe("PageEditor handle: flush and setMarkdown", () => {
  it("flush() sends the pending draft at once, and only once", async () => {
    const { ref, editor, drafts } = await mount({ markdown: "# Notes\n\nBody.\n" });
    act(() => typeAtEnd(editor, " More"));
    expect(drafts).toEqual([]);
    let text = "";
    act(() => {
      text = ref.current!.flush();
    });
    expect(text).toBe("# Notes\n\nBody. More\n");
    expect(drafts).toEqual(["# Notes\n\nBody. More\n"]);
    await act(() => wait(40));
    // the frame that was due finds nothing new
    expect(drafts).toHaveLength(1);
    act(() => {
      expect(ref.current!.flush()).toBe("# Notes\n\nBody. More\n");
    });
    expect(drafts).toHaveLength(1);
  });

  it("setMarkdown() takes a text equal to the last `markdown` value, without onChange", async () => {
    const original = "# Notes\n\nBody.\n";
    const { ref, editor, drafts, draw } = await mount({ markdown: original });
    act(() => typeAtEnd(editor, " Edited"));
    await act(() => wait(40));
    expect(drafts).toEqual(["# Notes\n\nBody. Edited\n"]);
    // the host still passes the old value: a re-render does not reload it…
    await act(async () => {
      draw();
      await wait(20);
    });
    expect(ref.current!.getMarkdown()).toBe("# Notes\n\nBody. Edited\n");
    // …setMarkdown does, as an undoable external edit
    await act(async () => {
      ref.current!.setMarkdown(original);
      await wait(40);
    });
    expect(ref.current!.getMarkdown()).toBe(original);
    expect(drafts).toHaveLength(1);
    act(() => {
      editor.undo();
    });
    expect(ref.current!.getMarkdown()).toBe("# Notes\n\nBody. Edited\n");
  });
});

describe("PageEditor focus and insertion from the title", () => {
  it("autoFocus comes after the render onReady causes, so a host's effect sees it", async () => {
    const seen: string[] = [];
    function Host() {
      const [editor, setEditor] = useState<GoTipeEditor | null>(null);
      // a host subscribes once it has the editor, in an effect of the next render
      useEffect(
        () =>
          editor?.on("selectionChange", () => {
            seen.push("selection");
          }),
        [editor],
      );
      return (
        <PageEditor markdown={"# Notes\n\nBody.\n"} locale="en" autoFocus onReady={setEditor} />
      );
    }
    await act(async () => {
      root.render(<Host />);
      await wait(60);
    });
    await act(() => wait(40));
    expect(seen).toContain("selection");
  });

  it.each([false, true])(
    "a host that subscribes after onReady sees focus, then the title's selection (StrictMode %s), with no frame",
    async (strict) => {
      // frames never come: the order must not depend on one
      vi.stubGlobal("requestAnimationFrame", () => 0);
      const seen: string[] = [];
      function Host() {
        const [editor, setEditor] = useState<GoTipeEditor | null>(null);
        useEffect(() => {
          if (!editor) return;
          const offFocus = editor.on("focus", () => seen.push("focus"));
          const offSelection = editor.on("selectionChange", () => {
            const { anchor } = editor.getViewState().selection;
            const title = editor.getViewState().blocks[0]?.id;
            seen.push(anchor.blockId === title ? "selection:title" : "selection:body");
          });
          return () => {
            offFocus();
            offSelection();
          };
        }, [editor]);
        return <PageEditor markdown={"# \n"} locale="en" autoFocus onReady={setEditor} />;
      }
      await act(async () => {
        root.render(
          strict ? (
            <StrictMode>
              <Host />
            </StrictMode>
          ) : (
            <Host />
          ),
        );
        await wait(60);
      });
      expect(seen.slice(0, 2)).toEqual(["focus", "selection:title"]);
      expect(seen.filter((event) => event === "focus")).toHaveLength(1);
    },
  );

  it("autoFocus still comes once under StrictMode", async () => {
    const focus = vi.fn();
    const ready = vi.fn();
    await act(async () => {
      root.render(
        <StrictMode>
          <PageEditor
            markdown={"# Notes\n"}
            locale="en"
            autoFocus
            onReady={(editor) => {
              ready();
              vi.spyOn(editor, "focus").mockImplementation(focus);
            }}
          />
        </StrictMode>,
      );
      await wait(60);
    });
    await act(() => wait(40));
    expect(focus.mock.calls).toEqual([["end"]]);
    expect(ready).toHaveBeenCalledOnce();
  });

  it("insertBlock from the title adds the block under it and keeps the title", async () => {
    const { ref, editor } = await mount({ markdown: "# Notes\n\nBody.\n" });
    const title = editor.getViewState().blocks[0]!;
    act(() => {
      editor.setSelection({
        anchor: { blockId: title.id, offset: 2 },
        head: { blockId: title.id, offset: 2 },
      });
      ref.current!.insertBlock("heading2");
    });
    const blocks = editor.getViewState().blocks;
    expect(blocks[0]).toMatchObject({ id: title.id, type: "heading", attrs: { level: 1 } });
    expect(blocks[1]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(ref.current!.getTitle()).toBe("Notes");
    // one action, one Cmd+Z: the paragraph it went into goes too, the caret is back in the title
    act(() => {
      expect(editor.undo()).toBe(true);
    });
    expect(editor.getViewState().blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
    ]);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: title.id, offset: 2 });
  });

  it("insertBlock in the body still turns an empty paragraph into the block", async () => {
    const { ref, editor } = await mount({ markdown: "# Notes\n\nBody.\n" });
    act(() => {
      editor.focus("end");
      editor.chain().insertBlockAfter("paragraph", {}).run();
      const empty = editor.getViewState().blocks[2]!;
      editor.setSelection({
        anchor: { blockId: empty.id, offset: 0 },
        head: { blockId: empty.id, offset: 0 },
      });
      ref.current!.insertBlock("divider");
    });
    // the caret's empty paragraph becomes the divider
    expect(editor.getViewState().blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "divider",
    ]);
    act(() => {
      expect(editor.undo()).toBe(true);
    });
    expect(editor.getViewState().blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
    ]);
  });
});

describe("PageEditor replacement history", () => {
  it("undoableReplace={false}: a shown version and the way back are not undo steps", async () => {
    const current = "# Notes\n\nToday.\n";
    const old = "# Notes\n\nLast week.\n";
    const { ref, editor, draw } = await mount({ markdown: current, undoableReplace: false });
    await act(async () => {
      draw({ markdown: old, undoableReplace: false });
      await wait(20);
    });
    expect(ref.current!.getMarkdown()).toBe(old);
    await act(async () => {
      draw({ markdown: current, undoableReplace: false });
      await wait(20);
    });
    act(() => {
      editor.undo();
    });
    expect(ref.current!.getMarkdown()).toBe(current);
  });

  it("by default a replacement is undoable; setMarkdown can opt out per call", async () => {
    const current = "# Notes\n\nToday.\n";
    const { ref, editor } = await mount({ markdown: current });
    await act(async () => {
      ref.current!.setMarkdown("# Notes\n\nNew.\n");
      await wait(20);
    });
    act(() => {
      editor.undo();
    });
    expect(ref.current!.getMarkdown()).toBe(current);
    await act(async () => {
      ref.current!.setMarkdown("# Notes\n\nOther.\n", { addToHistory: false });
      await wait(20);
    });
    act(() => {
      editor.undo();
    });
    expect(ref.current!.getMarkdown()).toBe("# Notes\n\nOther.\n");
  });
});

describe("PageEditor head, narrow sizes and review layout", () => {
  it("renders the icon and the header above the title, outside the Markdown", async () => {
    const { ref } = await mount({
      markdown: "# Notes\n\nBody.\n",
      icon: <svg data-testid="glyph" />,
      header: <span className="host-byline">by me</span>,
    });
    const head = container.querySelector(".gotipe-page .gotipe-page-head");
    expect(head?.querySelector(".gotipe-page-head-icon [data-testid='glyph']")).not.toBeNull();
    expect(head?.querySelector(".host-byline")?.textContent).toBe("by me");
    const title = container.querySelector(".gotipe-content h1");
    expect(head && title && head.compareDocumentPosition(title)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(ref.current!.getMarkdown()).toBe("# Notes\n\nBody.\n");
  });

  it('iconPlacement="inline" draws the icon in the title row, outside its text', async () => {
    const { ref, editor } = await mount({
      markdown: "# Notes\n\nBody.\n",
      icon: <svg data-testid="glyph" />,
      iconPlacement: "inline",
    });
    expect(container.querySelector(".gotipe-page-head")).toBeNull();
    const icon = container.querySelector(".gotipe-page-title > .gotipe-page-title-icon");
    expect(icon?.getAttribute("data-gotipe-widget")).toBe("");
    expect(icon?.querySelector("[data-testid='glyph']")).not.toBeNull();
    const title = editor.getViewState().blocks[0]!;
    act(() => {
      editor.setSelection({
        anchor: { blockId: title.id, offset: 0 },
        head: { blockId: title.id, offset: 0 },
      });
      editor.chain().insertText("My ").run();
    });
    expect(ref.current!.getTitle()).toBe("My Notes");
    expect(ref.current!.getMarkdown()).toBe("# My Notes\n\nBody.\n");
  });

  it("selectionMarkdownRange: the selection in the file, without a mark's delimiters", async () => {
    const markdown = "# Notes\n\nSee **bold** and _this_ here.\n\nNext line.\n";
    const { ref, editor } = await mount({ markdown });
    const [, body, next] = editor.getViewState().blocks;
    const select = (
      anchor: { blockId: string; offset: number },
      head: { blockId: string; offset: number },
    ) => act(() => editor.setSelection({ anchor, head }));
    const slice = () => {
      const range = ref.current!.selectionMarkdownRange()!;
      return markdown.slice(range.start, range.end);
    };
    expect(ref.current!.getMarkdown()).toBe(markdown);
    // "bold", as a double click selects it, either way round
    select({ blockId: body!.id, offset: 4 }, { blockId: body!.id, offset: 8 });
    expect(slice()).toBe("bold");
    select({ blockId: body!.id, offset: 8 }, { blockId: body!.id, offset: 4 });
    expect(slice()).toBe("bold");
    select({ blockId: body!.id, offset: 13 }, { blockId: body!.id, offset: 17 });
    expect(slice()).toBe("this");
    // across blocks, backwards
    select({ blockId: next!.id, offset: 4 }, { blockId: body!.id, offset: 13 });
    expect(slice()).toBe("this_ here.\n\nNext");
    // a caret: an empty range
    select({ blockId: body!.id, offset: 8 }, { blockId: body!.id, offset: 8 });
    const caret = ref.current!.selectionMarkdownRange()!;
    expect(caret.end).toBe(caret.start);
  });

  it("bookmark: a place that follows edits, and its offset in the file", async () => {
    const markdown = "# Notes\n\nSee **bold** here.\n";
    const { ref, editor } = await mount({ markdown });
    const body = editor.getViewState().blocks[1]!;
    const at = (offset: number) => ({ blockId: body.id, offset });
    // the end of "bold"
    const mark = ref.current!.bookmark(at(8))!;
    expect(ref.current!.markdownOffset(mark.resolve()!, "before")).toBe(
      markdown.indexOf("** here"),
    );
    expect(ref.current!.markdownOffset(mark.resolve()!)).toBe(markdown.indexOf(" here"));
    // typing before it moves it
    act(() => {
      editor.setSelection({ anchor: at(0), head: at(0) });
      editor.chain().insertText("Do ").run();
    });
    expect(mark.resolve()).toEqual(at(11));
    // typing right at it goes before it (bias "after")
    act(() => {
      editor.setSelection({ anchor: at(11), head: at(11) });
      editor.chain().insertText("er").run();
    });
    expect(mark.resolve()).toEqual(at(13));
    const caret = ref.current!.bookmark(undefined, "before")!;
    expect(caret.resolve()).toEqual(at(13));
    mark.release();
    expect(mark.resolve()).toBeNull();
    // gone with its block
    act(() => {
      editor.chain().deleteBlock(body.id).run();
    });
    expect(caret.resolve()).toBeNull();
  });

  it("bookmark: follows a split and a join, and comes back after setMarkdown and back", async () => {
    const markdown = "# Notes\n\nHello brave world.\n\nEnd.\n";
    const { ref, editor } = await mount({ markdown });
    const body = editor.getViewState().blocks[1]!;
    // at "w" of "world"
    const mark = ref.current!.bookmark({ blockId: body.id, offset: 12 })!;
    act(() => {
      editor.setSelection({
        anchor: { blockId: body.id, offset: 6 },
        head: { blockId: body.id, offset: 6 },
      });
      editor.chain().splitBlock().run();
    });
    const second = editor.getViewState().blocks[2]!;
    expect(mark.resolve()).toEqual({ blockId: second.id, offset: 6 });
    act(() => {
      editor.setSelection({
        anchor: { blockId: second.id, offset: 0 },
        head: { blockId: second.id, offset: 0 },
      });
      editor.chain().mergeWithPrevious().run();
    });
    expect(mark.resolve()).toEqual({ blockId: body.id, offset: 12 });
    const current = ref.current!.getMarkdown();
    expect(current).toBe(markdown);
    // another version shown, then the current one again
    await act(async () => {
      ref.current!.setMarkdown("# Notes\n\nAn older text.\n");
      await wait(20);
    });
    expect(mark.resolve()).toBeNull();
    await act(async () => {
      ref.current!.setMarkdown(current);
      await wait(20);
    });
    const back = mark.resolve()!;
    expect(back.offset).toBe(12);
    const offset = ref.current!.markdownOffset(back)!;
    expect(current.slice(offset)).toBe("world.\n\nEnd.\n");
    mark.release();
  });

  it("afterBlock: the host's field in the flow after a block, its keys its own", async () => {
    const markdown = "# Notes\n\n- one\n- two\n\nAfter.\n";
    const field = <input aria-label="Write with the model" />;
    const { ref, editor, draw } = await mount({ markdown });
    const [, list] = editor.getViewState().blocks;
    const item = list!.children[1]!;
    // an item's id: the field stands after the whole list, not inside it
    await act(async () => {
      draw({ afterBlock: { blockId: item.id, node: field } });
      await wait(20);
    });
    const slot = container.querySelector<HTMLElement>("[data-gotipe-block-slot]")!;
    expect(slot.previousElementSibling?.getAttribute("data-block-id")).toBe(list!.id);
    expect(slot.closest("ul, ol")).toBeNull();
    const input = slot.querySelector("input")!;
    const seen = vi.fn();
    document.body.addEventListener("keydown", seen);
    const before = JSON.stringify(editor.getJSON());
    act(() => {
      input.focus();
      for (const key of ["Enter", "Backspace", "a", "/"]) {
        const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        input.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
    });
    document.body.removeEventListener("keydown", seen);
    expect(seen).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    // not in the file
    expect(ref.current!.getMarkdown()).toBe(markdown);
    await act(async () => {
      draw({ afterBlock: null });
      await wait(20);
    });
    expect(container.querySelector("[data-gotipe-block-slot]")).toBeNull();
  });

  it("an inline icon is not part of the title's accessible name", async () => {
    const { ref } = await mount({
      markdown: "# Notes\n\n## Part\n",
      icon: (
        <button type="button" aria-label="Page icon">
          <svg />
        </button>
      ),
      iconPlacement: "inline",
    });
    const heading = () => container.querySelector<HTMLElement>(".gotipe-page-title")!;
    expect(heading().getAttribute("aria-label")).toBe("Notes");
    // other headings keep the name from their content
    expect(container.querySelector("h2")?.hasAttribute("aria-label")).toBe(false);
    await act(async () => {
      ref.current!.setMarkdown("#\n\n## Part\n");
      await wait(20);
    });
    // an empty title is named by its prompt, never by the icon's label
    expect(heading().getAttribute("aria-label")).toBe(heading().getAttribute("data-placeholder"));
    expect(heading().getAttribute("aria-label")).toBeTruthy();
  });

  it("an inline icon that is the host's button stays reachable and keeps its events", async () => {
    const opened = vi.fn();
    const { ref, editor } = await mount({
      markdown: "# Notes\n\nBody.\n",
      icon: (
        <button type="button" aria-label="Page icon" onClick={opened}>
          <svg />
        </button>
      ),
      iconPlacement: "inline",
    });
    const wrapper = container.querySelector(".gotipe-page-title-icon");
    expect(wrapper?.hasAttribute("aria-hidden")).toBe(false);
    expect(wrapper?.closest("[aria-hidden='true']")).toBeNull();
    const button = container.querySelector<HTMLButtonElement>("button[aria-label='Page icon']")!;
    expect(button.getAttribute("type")).toBe("button");
    const title = editor.getViewState().blocks[0]!;
    act(() => {
      editor.setSelection({
        anchor: { blockId: title.id, offset: 2 },
        head: { blockId: title.id, offset: 2 },
      });
    });
    const before = JSON.stringify(editor.getJSON());
    const selection = JSON.stringify(editor.getViewState().selection);
    const markdown = ref.current!.getMarkdown();
    const seen = vi.fn();
    // past the page: the keys stop at the icon; a click goes on, so the editor's menus close
    const clicked = vi.fn();
    document.body.addEventListener("keydown", seen);
    document.body.addEventListener("mousedown", clicked);
    act(() => {
      button.focus();
      for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
        button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      }
      for (const key of ["Enter", "Backspace", "a"]) {
        const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        button.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
    });
    expect(opened).toHaveBeenCalledOnce();
    expect(seen).not.toHaveBeenCalled();
    expect(clicked).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(button);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    expect(JSON.stringify(editor.getViewState().selection)).toBe(selection);
    expect(ref.current!.getMarkdown()).toBe(markdown);
    expect(ref.current!.getTitle()).toBe("Notes");
    document.body.removeEventListener("keydown", seen);
    document.body.removeEventListener("mousedown", clicked);
  });

  it("a host that re-renders with a new inline icon keeps the headings and the caret", async () => {
    const { editor, draw } = await mount({
      markdown: "# Notes\n\n## Part\n",
      icon: <svg data-testid="glyph" />,
      iconPlacement: "inline",
    });
    const before = [...container.querySelectorAll("h1, h2")];
    const title = editor.getViewState().blocks[0]!;
    act(() => {
      editor.setSelection({
        anchor: { blockId: title.id, offset: 2 },
        head: { blockId: title.id, offset: 2 },
      });
    });
    await act(async () => {
      draw({ icon: <svg data-testid="glyph" />, iconPlacement: "inline" });
      await wait(20);
    });
    const after = [...container.querySelectorAll("h1, h2")];
    expect(after).toHaveLength(2);
    expect(after.every((node, index) => node === before[index])).toBe(true);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: title.id, offset: 2 });
  });

  it("has no head and keeps the narrow sizes by default", async () => {
    await mount({ markdown: "# Notes\n" });
    expect(container.querySelector(".gotipe-page-head")).toBeNull();
    expect(container.querySelector("[data-gt-narrow]")).toBeNull();
  });

  it("narrow={false} marks the page and the editor", async () => {
    await mount({ markdown: "# Notes\n", narrow: false });
    expect(container.querySelector(".gotipe-page")?.getAttribute("data-gt-narrow")).toBe("off");
    expect(container.querySelector(".gotipe-block-editor")?.getAttribute("data-gt-narrow")).toBe(
      "off",
    );
  });

  it("reviewLayout decides the margin column whatever the width", async () => {
    const review = {
      lanes: [{ id: "agent", name: "Agent", kind: "agent" as const }],
      proposals: [],
      comments: [
        {
          id: "c1",
          laneId: "agent",
          anchor: { before: "", quote: "Body", after: "." },
          text: "Why?",
        },
      ],
    };
    // jsdom has no width: `auto` stays inline
    await mount({ markdown: "# Notes\n\nBody.\n", review });
    const page = () => container.querySelector(".gotipe-page");
    expect(page()?.hasAttribute("data-review-layout")).toBe(false);
    act(() => root.unmount());
    root = createRoot(container);
    await mount({ markdown: "# Notes\n\nBody.\n", review, reviewLayout: "margin" });
    expect(page()?.getAttribute("data-review-layout")).toBe("margin");
    act(() => root.unmount());
    root = createRoot(container);
    await mount({ markdown: "# Notes\n\nBody.\n", review, reviewLayout: "inline" });
    expect(page()?.hasAttribute("data-review-layout")).toBe(false);
  });
});

describe("PageEditor assets", () => {
  it("gives the editor the host's discardAsset", async () => {
    const discardAsset = vi.fn();
    const { editor } = await mount({
      markdown: "# Notes\n",
      host: { saveAsset: async () => ({ src: "assets/a.png" }), discardAsset },
    });
    const asset = { src: "assets/a.png", name: "a.png", kind: "image" as const };
    editor.host.discardAsset?.(asset);
    expect(discardAsset).toHaveBeenCalledWith(asset);
  });

  it("a host resolver's null shows the image as unavailable and never uses the raw path", async () => {
    const resolveAsset = vi.fn(() => null);
    await mount({ markdown: "# Notes\n\n![Plan](assets/plan.png)\n", host: { resolveAsset } });
    await act(() => wait(30));
    expect(resolveAsset).toHaveBeenCalledWith("assets/plan.png");
    expect(container.querySelector('img[src="assets/plan.png"]')).toBeNull();
    expect(container.querySelector(".gotipe-image-error")).not.toBeNull();
  });

  it("without a resolver the path is shown as it is", async () => {
    await mount({ markdown: "# Notes\n\n![Plan](https://example.test/plan.png)\n" });
    await act(() => wait(30));
    expect(container.querySelector('img[src="https://example.test/plan.png"]')).not.toBeNull();
  });
});

describe("PageEditor placeholders", () => {
  it("an empty image the file itself holds is kept byte for byte", async () => {
    const markdown = "# T\n\npara\n\n![alt]()\n\nend\n";
    const { ref, drafts } = await mount({ markdown });
    let text = "";
    act(() => {
      text = ref.current!.flush();
    });
    expect(text).toBe(markdown);
    expect(drafts).toEqual([]);
  });

  it("an image or file without a source is not written to the file", async () => {
    const markdown = "# Notes\n\nBody.\n";
    const { ref, editor, drafts } = await mount({ markdown });
    act(() => {
      editor.focus("end");
      ref.current!.insertBlock("image");
      ref.current!.insertBlock("file");
    });
    expect(editor.getViewState().blocks.map((block) => block.type)).toContain("image");
    let text = "";
    act(() => {
      text = ref.current!.flush();
    });
    expect(text).toBe(markdown);
    expect(ref.current!.getMarkdown()).toBe(markdown);
    expect(drafts).toEqual([]);
    // once it has a source it is content
    const image = editor.getViewState().blocks.find((block) => block.type === "image")!;
    act(() => {
      editor.dispatch({
        steps: [{ type: "setBlockAttrs", blockId: image.id, attrs: { src: "assets/a.png" } }],
      });
    });
    expect(ref.current!.flush()).toContain("![](assets/a.png)");
  });
});

describe("PageEditor media options", () => {
  it("passes media to the placeholders: no “By link” with links: false", async () => {
    const byLink = () =>
      [...container.querySelectorAll("button")].filter((button) =>
        /link/i.test(button.textContent ?? ""),
      );
    const { ref } = await mount({ markdown: "# Notes\n" });
    act(() => ref.current!.insertBlock("image"));
    expect(byLink().length).toBeGreaterThan(0);
    act(() => root.unmount());
    root = createRoot(container);
    const next = await mount({ markdown: "# Notes\n", media: { links: false } });
    act(() => next.ref.current!.insertBlock("image"));
    expect(container.querySelector(".gotipe-media-placeholder")).not.toBeNull();
    expect(byLink()).toEqual([]);
  });
});

describe("PageEditor slash menu", () => {
  const openSlash = async (editor: GoTipeEditor) => {
    await act(async () => {
      editor.focus("end");
      editor.chain().insertBlockAfter("paragraph", {}).run();
      editor.chain().insertText("/").run();
      // the core opens the menu on a typed “/”: here the text is inserted directly
      editor.emit("openSlashMenu");
      await wait(40);
    });
  };
  const rows = () =>
    [...document.querySelectorAll(".gotipe-slash-menu [role='group']")].map((group) => ({
      group: group.getAttribute("aria-label"),
      items: [...group.querySelectorAll(".gotipe-slash-menu-item-title")].map(
        (title) => title.textContent,
      ),
      hints: [...group.querySelectorAll(".gotipe-slash-menu-item-description")].map(
        (hint) => hint.textContent,
      ),
    }));

  it("takes the host's commands, groups in its order and row descriptions", async () => {
    const run = vi.fn();
    const agent: SlashCommandDef = {
      name: "Agent instructions",
      aliases: ["agent"],
      description: "A note the agent follows",
      icon: "sparkle",
      group: "notes",
      execute: run,
    };
    const { editor } = await mount({
      markdown: "# Notes\n",
      slashMenu: {
        commands: (defaults) => [...defaults.filter((command) => command.group !== "style"), agent],
        groups: [
          { id: "upload", label: "Media" },
          { id: "notes", label: "Notes" },
          { id: "insert", label: "Insert" },
        ],
        descriptions: true,
      },
    });
    await openSlash(editor);
    const shown = rows();
    expect(shown.map((group) => group.group)).toEqual(["Media", "Notes", "Insert"]);
    expect(shown[0]?.items).toEqual(["Image", "File"]);
    expect(shown[1]).toEqual({
      group: "Notes",
      items: ["Agent instructions"],
      hints: ["A note the agent follows"],
    });
  });

  it("draws the host's icon and meta for its command, the built-in ones for the rest", async () => {
    const agent: SlashCommandDef = {
      name: "Agent instructions",
      aliases: ["agent"],
      icon: "quote",
      group: "insert",
      execute: vi.fn(),
    };
    const { editor } = await mount({
      markdown: "# Notes\n",
      slashMenu: {
        commands: (defaults) => [...defaults, agent],
        renderIcon: (command) =>
          command === agent ? (
            <svg data-testid="agent-icon" />
          ) : command.name === "Divider" ? null : undefined,
        renderMeta: (command) => (command === agent ? null : undefined),
      },
    });
    await openSlash(editor);
    const row = (name: string) =>
      [...document.querySelectorAll(".gotipe-slash-menu-item")].find(
        (item) => item.querySelector(".gotipe-slash-menu-item-title")?.textContent === name,
      );
    expect(row("Agent instructions")?.querySelector("[data-testid='agent-icon']")).not.toBeNull();
    // the quote icon would bring the “>” shortcut: the host said none
    expect(row("Agent instructions")?.querySelector(".gotipe-slash-menu-item-meta")).toBeNull();
    expect(row("Heading 1")?.querySelector(".gotipe-slash-menu-item-meta")?.textContent).toBe("#");
    expect(row("Heading 1")?.querySelector(".gotipe-slash-menu-item-icon svg")).not.toBeNull();
    // null: no icon at all
    expect(row("Divider")?.querySelector(".gotipe-slash-menu-item-icon")?.childElementCount).toBe(
      0,
    );
  });

  it("keeps the page's own menu by default, without descriptions", async () => {
    const { editor } = await mount({ markdown: "# Notes\n" });
    await openSlash(editor);
    const shown = rows();
    expect(shown.map((group) => group.group)).toEqual(["Style", "Insert", "Upload"]);
    expect(shown.flatMap((group) => group.hints)).toEqual([]);
  });
});
