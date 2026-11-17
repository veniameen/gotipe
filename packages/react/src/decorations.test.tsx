import {
  Bold,
  FindReplace,
  Focus,
  Heading,
  InvisibleCharacters,
  Paragraph,
  Placeholder,
  TextAlign,
  getFindReplace,
  setInvisibleCharacters,
  setTextAlign,
} from "@gotipe/core/extensions";
// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorContent } from "./editor-content";

let editor: GoTipeEditor;
let container: HTMLDivElement;
let root: Root;
const paragraph = (id: string, text: string) => ({
  id,
  type: "paragraph",
  attrs: {},
  content: text ? [{ text, marks: [] }] : [],
  children: [],
});
async function render(blocks: unknown[], extensions = [Paragraph, Heading, Bold]) {
  editor = await createEditor({ extensions, content: { version: 1, blocks } });
  act(() => root.render(<EditorContent editor={editor} />));
}
const block = (id: string) => container.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
/** The block's own text, without widgets (carets, ghost text, paragraph marks). */
const ownText = (element: Element) => {
  const clone = element.cloneNode(true) as Element;
  for (const widget of clone.querySelectorAll("[data-gotipe-widget]")) widget.remove();
  return clone.textContent;
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  editor?.destroy();
  container.remove();
});

describe("decoration layers drawn by EditorContent (D-20)", () => {
  it("draws comment highlights and proposals with the theme classes", async () => {
    await render([paragraph("p", "Привет, мир 😀")]);
    act(() => {
      editor.setDecorations("comments", [
        {
          type: "comment-highlight",
          commentId: "c1",
          blockId: "p",
          from: 0,
          to: 6,
          resolved: false,
        },
        {
          type: "comment-highlight",
          commentId: "c2",
          blockId: "p",
          from: 8,
          to: 11,
          resolved: true,
        },
      ]);
      editor.setDecorations("suggestions", [
        { type: "suggestion-delete", suggestionId: "s1", blockId: "p", from: 12, to: 14 },
      ]);
    });
    const open = block("p").querySelector<HTMLElement>('[data-comment-id="c1"]')!;
    expect(open.className).toBe("gotipe-comment-highlight");
    expect(open.textContent).toBe("Привет");
    expect(block("p").querySelector('[data-comment-id="c2"]')?.className).toBe(
      "gotipe-comment-highlight resolved",
    );
    const removed = block("p").querySelector('[data-suggestion-id="s1"]')!;
    expect(removed.className).toBe("gotipe-suggestion-delete");
    expect(removed.textContent).toBe("😀");
    expect(block("p").textContent).toBe("Привет, мир 😀");
  });

  it("draws other people's carets and selections without changing the text", async () => {
    await render([paragraph("p", "abcdef")]);
    act(() =>
      editor.setDecorations("collaboration", [
        {
          type: "remote-cursor",
          peerId: "ann",
          blockId: "p",
          offset: 3,
          user: { name: "Ann", color: "#2c62d4" },
        },
        { type: "remote-selection", peerId: "bob", blockId: "p", from: 0, to: 2, color: "red;x" },
      ]),
    );
    const caret = block("p").querySelector<HTMLElement>(
      '.gotipe-remote-cursor[data-peer-id="ann"]',
    )!;
    expect(caret.getAttribute("contenteditable")).toBe("false");
    expect(caret.hasAttribute("data-gotipe-widget")).toBe(true);
    expect(caret.querySelector(".gotipe-remote-cursor-label")?.textContent).toBe("Ann");
    expect(
      caret.querySelector<HTMLElement>(".gotipe-remote-cursor-caret")?.style.backgroundColor,
    ).toBe("rgb(44, 98, 212)");
    expect(ownText(block("p"))).toBe("abcdef");
    // The caret stands between "abc" and "def".
    const before = document.createRange();
    before.setStart(block("p"), 0);
    before.setEndBefore(caret);
    expect(before.toString()).toBe("abc");
    const range = block("p").querySelector<HTMLElement>(
      '.gotipe-remote-range[data-peer-id="bob"]',
    )!;
    expect(range.textContent).toBe("ab");
    // An unsafe color is dropped instead of reaching the style.
    expect(range.getAttribute("style")).toBeNull();
  });

  it("draws the Placeholder extension's text on an empty document, not when read-only", async () => {
    await render([paragraph("p", "")], [Paragraph, Placeholder.configure({ text: "Write…" })]);
    expect(block("p").getAttribute("data-placeholder")).toBe("Write…");
    act(() => editor.setEditable(false));
    expect(block("p").hasAttribute("data-placeholder")).toBe(false);
  });

  it("draws ghost text as a widget at its offset", async () => {
    await render([paragraph("p", "ab")]);
    act(() =>
      editor.setDecorations("ai", [{ type: "ghost-text", text: "cd", blockId: "p", offset: 2 }]),
    );
    const ghost = block("p").querySelector(".gotipe-ghost-text[data-gotipe-ghost-text]")!;
    expect(ghost.textContent).toBe("cd");
    expect(ownText(block("p"))).toBe("ab");
  });

  it("draws the search, invisible-character and focus layers and block alignment", async () => {
    await render(
      [paragraph("a", "cat and cat"), paragraph("b", "")],
      [
        Paragraph,
        FindReplace,
        InvisibleCharacters,
        Focus.configure({ onlyWhenFocused: false }),
        TextAlign,
      ],
    );
    act(() => {
      getFindReplace(editor)!.setSearch({ query: "cat" });
      setInvisibleCharacters(editor, true);
      setTextAlign(editor, "center");
    });
    const matches = block("a").querySelectorAll("[data-gotipe-search-match]");
    expect([...matches].map((match) => match.className)).toEqual([
      "gotipe-match is-current",
      "gotipe-match",
    ]);
    expect(block("a").querySelectorAll(".gotipe-sp")).toHaveLength(2);
    expect(block("a").querySelector(".gotipe-pilcrow")?.hasAttribute("data-gotipe-widget")).toBe(
      true,
    );
    expect(block("b").querySelector(".gotipe-pilcrow")).not.toBeNull();
    expect(ownText(block("a"))).toBe("cat and cat");
    expect(block("a").classList.contains("has-focus")).toBe(true);
    expect(block("a").getAttribute("data-align")).toBe("center");
    expect(block("a").style.textAlign).toBe("center");
  });

  it("keeps the native caret when only a decoration layer changes", async () => {
    await render([paragraph("p", "hello world")]);
    const surface = container.querySelector<HTMLElement>("[data-gotipe-content]")!;
    surface.focus();
    act(() =>
      editor.setSelection({
        anchor: { blockId: "p", offset: 8 },
        head: { blockId: "p", offset: 8 },
      }),
    );
    expect(editor.getDOMSelection()?.head).toEqual({ blockId: "p", offset: 8 });
    for (const offset of [2, 7, 9]) {
      act(() =>
        editor.setDecorations("collaboration", [
          {
            type: "remote-cursor",
            peerId: "ann",
            blockId: "p",
            offset,
            user: { name: "Ann", color: "#2c62d4" },
          },
        ]),
      );
      expect(editor.getDOMSelection()?.head).toEqual({ blockId: "p", offset: 8 });
    }
    expect(editor.getViewState().selection.head).toEqual({ blockId: "p", offset: 8 });
  });

  it("holds the composing block's decorations and the native selection until the IME ends", async () => {
    await render([paragraph("p", "hello world"), paragraph("q", "other")]);
    const surface = container.querySelector<HTMLElement>("[data-gotipe-content]")!;
    surface.focus();
    act(() =>
      editor.setSelection({
        anchor: { blockId: "p", offset: 5 },
        head: { blockId: "p", offset: 5 },
      }),
    );
    const setSelection = vi.spyOn(editor, "setSelection");
    const caret = (blockId: string, offset: number) => ({
      type: "remote-cursor" as const,
      peerId: "ann",
      blockId,
      offset,
      user: { name: "Ann", color: "#2c62d4" },
    });
    const text = block("p").firstChild!;
    // Another person's caret moves through the paragraph as the IME starts in it: React
    // draws the change only once the composition is running.
    act(() => {
      editor.setDecorations("collaboration", [caret("p", 2), caret("q", 1)]);
      text.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    });
    expect(editor.isComposing).toBe(true);
    expect(block("p").querySelector(".gotipe-remote-cursor")).toBeNull();
    expect(block("p").firstChild).toBe(text);
    expect(block("q").querySelector(".gotipe-remote-cursor")).not.toBeNull();
    act(() => editor.setDecorations("collaboration", [caret("p", 7)]));
    expect(block("p").querySelector(".gotipe-remote-cursor")).toBeNull();
    expect(setSelection).not.toHaveBeenCalled();
    act(() => {
      text.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" }));
    });
    expect(editor.isComposing).toBe(false);
    const drawn = block("p").querySelector(".gotipe-remote-cursor")!;
    const before = document.createRange();
    before.setStart(block("p"), 0);
    before.setEndBefore(drawn);
    expect(before.toString()).toBe("hello w");
    expect(ownText(block("p"))).toBe("hello world");
  });
});
