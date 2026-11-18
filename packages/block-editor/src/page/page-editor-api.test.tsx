// @vitest-environment jsdom
import type { GoTipeEditor, SlashCommandDef } from "@gotipe/core";
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

  it("keeps the page's own menu by default, without descriptions", async () => {
    const { editor } = await mount({ markdown: "# Notes\n" });
    await openSlash(editor);
    const shown = rows();
    expect(shown.map((group) => group.group)).toEqual(["Style", "Insert", "Upload"]);
    expect(shown.flatMap((group) => group.hints)).toEqual([]);
  });
});
