// @vitest-environment jsdom
import type { GoTipeError } from "@gotipe/core";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { Editor } from "@gotipe/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlockEditor } from "../components/block-editor";
import { blockLink } from "../interaction/block-link";
import { PageEditor } from "../page/page-editor";
import { useHeadingAnchors } from "./heading-anchor";

const block = (id: string, type: string, text: string, attrs: Record<string, unknown> = {}) => ({
  id,
  type,
  attrs,
  content: text ? [{ text, marks: [] }] : [],
  children: [],
});
const heading = (id: string, level: number, text: string) => block(id, "heading", text, { level });
/** The headings of the Atlas page: the title, the outline's three levels, an h4 and an empty h2. */
const PAGE = {
  version: 1,
  blocks: [
    heading("title", 1, "Offline drafts"),
    block("intro", "paragraph", "Editing without a network"),
    heading("how", 1, "How it works"),
    heading("what", 2, "What changes"),
    heading("order", 3, "Rollout order"),
    heading("deep", 4, "Details"),
    heading("empty", 2, ""),
  ],
};

let container: HTMLDivElement;
let root: Root;
let editor: GoTipeEditor;
const writeText = vi.fn<(text: string) => Promise<void>>();
const anchorOf = (id: string) =>
  container.querySelector<HTMLElement>(`[data-block-id="${id}"] .gotipe-heading-anchor`);
const anchored = () =>
  [...container.querySelectorAll(".gotipe-heading-anchor")].map((anchor) =>
    anchor.closest("[data-block-id]")?.getAttribute("data-block-id"),
  );

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const rect = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON() {} }) as DOMRect;
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  editor = await createEditor({ extensions: [FullPreset], content: PAGE });
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
});

describe("heading anchors of the docs view (Atlas frame 2)", () => {
  it("go to the headings the outline lists and to nothing else", () => {
    act(() => root.render(<BlockEditor editor={editor} view="docs" showAiCommandBar={false} />));
    expect(anchored()).toEqual(["how", "what", "order"]);
    const anchor = anchorOf("what")!;
    // a widget after the last word: outside the text, out of Tab and out of the heading's name
    expect(anchor.parentElement?.matches("[data-gotipe-widget][contenteditable=false]")).toBe(true);
    expect(anchor.parentElement?.previousSibling?.textContent).toBe("What changes");
    expect(anchor.getAttribute("aria-hidden")).toBe("true");
    expect(anchor.querySelector("button")?.tabIndex).toBe(-1);
    expect(anchor.querySelector(".gotipe-tip")?.textContent).toBe("Copy link");
    expect(editor.getText()).not.toContain("Copy link");

    act(() => root.render(<BlockEditor editor={editor} view="notion" showAiCommandBar={false} />));
    expect(anchored()).toEqual([]);
  });

  it("follow the document: a heading that gets text gets its anchor", () => {
    act(() => root.render(<BlockEditor editor={editor} view="docs" showAiCommandBar={false} />));
    act(() => {
      const end = { blockId: "empty", offset: 0 };
      editor.setSelection({ anchor: end, head: end });
      editor.chain().insertText("Tasks").run();
    });
    expect(anchored()).toEqual(["how", "what", "order", "empty"]);
  });

  it("copy the link “Copy link to block” copies and say so", async () => {
    act(() => root.render(<BlockEditor editor={editor} view="docs" showAiCommandBar={false} />));
    const button = anchorOf("order")!.querySelector("button")!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(blockLink("order"));
    expect(new URL(writeText.mock.calls[0]![0]).searchParams.get("gotipe-block")).toBe("order");
    expect(button.querySelector(".gotipe-tip")?.textContent).toBe("Link copied");
    expect(button.getAttribute("aria-label")).toBe("Link copied");
  });

  it("report a refused clipboard as the editor's error and do not say it is copied", async () => {
    writeText.mockRejectedValue(new Error("Write permission denied."));
    const errors: GoTipeError[] = [];
    const off = editor.on("error", (error) => errors.push(error));
    act(() => root.render(<BlockEditor editor={editor} view="docs" showAiCommandBar={false} />));
    const button = anchorOf("how")!.querySelector("button")!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(errors.map(({ code, message }) => [code, message])).toEqual([
      ["CLIPBOARD_FAILED", "Write permission denied."],
    ]);
    expect(button.querySelector(".gotipe-tip")?.textContent).toBe("Copy link");
    off();
  });

  it("show on the heading the handle stands at, which a touch also chooses", () => {
    function Probe({ hovered }: { hovered: string | null }) {
      const afterText = useHeadingAnchors(editor, "docs", hovered);
      return <Editor editor={editor} afterText={afterText} />;
    }
    const shown = () =>
      [...container.querySelectorAll(".gotipe-heading-anchor.is-hovered")].map((anchor) =>
        anchor.closest("[data-block-id]")?.getAttribute("data-block-id"),
      );
    act(() => root.render(<Probe hovered={null} />));
    expect(shown()).toEqual([]);
    act(() => root.render(<Probe hovered="what" />));
    expect(shown()).toEqual(["what"]);
    act(() => root.render(<Probe hovered="intro" />));
    expect(shown()).toEqual([]);
  });

  it("go to the headings of a PageEditor page in docs, not to its title", async () => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    await act(async () => {
      root.render(
        <PageEditor
          markdown={
            "# Offline drafts\n\nEditing without a network.\n\n## How it works\n\nThe log.\n"
          }
          view="docs"
          autoFocus={false}
        />,
      );
      await wait(60);
    });
    const headings = [...container.querySelectorAll("h1, h2")];
    expect(headings.map((element) => element.textContent)).toEqual([
      "Offline drafts",
      "How it worksCopy link",
    ]);
    expect(headings[0]?.querySelector(".gotipe-heading-anchor")).toBeNull();
  });
});

describe("blockLink", () => {
  it("keeps the host's address — route, query, hash — and names one block", () => {
    expect(blockLink("b", "https://wiki.test/space/page?tab=1&gotipe-block=a#intro")).toBe(
      "https://wiki.test/space/page?tab=1&gotipe-block=b#intro",
    );
    expect(blockLink("Как-это", "https://wiki.test/page")).toBe(
      "https://wiki.test/page?gotipe-block=%D0%9A%D0%B0%D0%BA-%D1%8D%D1%82%D0%BE",
    );
  });
});
