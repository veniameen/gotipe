import {
  BulletList,
  FindReplace,
  Focus,
  InvisibleCharacters,
  ListItem,
  Paragraph,
  Placeholder,
  TextAlign,
  getFindReplace,
  setInvisibleCharacters,
  setTextAlign,
} from "@gotipe/core/extensions";
// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type App, createApp, h, nextTick } from "vue";
import { EditorContent } from "./editor-content";

const apps: App[] = [];
const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

const paragraph = (id: string, text: string) => ({
  id,
  type: "paragraph",
  attrs: {},
  content: text ? [{ text, marks: [] }] : [],
  children: [],
});
async function mount(
  blocks: unknown[],
  extensions = [Paragraph, BulletList, ListItem],
  props: Record<string, unknown> = {},
) {
  const editor = await createEditor({ extensions, engine: "js", content: { version: 1, blocks } });
  editors.push(editor);
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp({ setup: () => () => h(EditorContent, { editor, ...props }) });
  apps.push(app);
  app.mount(root);
  await nextTick();
  const block = (id: string) => root.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
  return { editor, root, block };
}
const ownText = (element: Element) => {
  const clone = element.cloneNode(true) as Element;
  for (const widget of clone.querySelectorAll("[data-gotipe-widget]")) widget.remove();
  return clone.textContent;
};

describe("Vue EditorContent draws every decoration layer (D-20)", () => {
  it("draws inline ranges and widgets of comments, people and the model", async () => {
    const { editor, block } = await mount([paragraph("p", "Привет 😀 мир")]);
    editor.setDecorations("comments", [
      { type: "comment-highlight", commentId: "c", blockId: "p", from: 0, to: 6, resolved: false },
    ]);
    editor.setDecorations("collaboration", [
      {
        type: "remote-cursor",
        peerId: "ann",
        blockId: "p",
        offset: 9,
        user: { name: "Аня", color: "#2c62d4" },
      },
      { type: "remote-selection", peerId: "bob", blockId: "p", from: 7, to: 9, color: "#2c62d4" },
    ]);
    editor.setDecorations("review", [
      {
        type: "inline",
        key: "x",
        blockId: "p",
        from: 10,
        to: 13,
        className: "custom",
        attrs: { "data-x": "1" },
      },
      { type: "ghost-text", text: "!", blockId: "p", offset: 13 },
    ]);
    await nextTick();
    expect(block("p").querySelector('[data-comment-id="c"]')?.className).toBe(
      "gotipe-comment-highlight",
    );
    expect(block("p").querySelector('[data-comment-id="c"]')?.textContent).toBe("Привет");
    const caret = block("p").querySelector('.gotipe-remote-cursor[data-peer-id="ann"]')!;
    expect(caret.getAttribute("contenteditable")).toBe("false");
    expect(caret.querySelector(".gotipe-remote-cursor-label")?.textContent).toBe("Аня");
    expect(block("p").querySelector('.gotipe-remote-range[data-peer-id="bob"]')?.textContent).toBe(
      "😀",
    );
    expect(block("p").querySelector(".custom[data-x='1']")?.textContent).toBe("мир");
    expect(block("p").querySelector(".gotipe-ghost-text")?.textContent).toBe("!");
    expect(ownText(block("p"))).toBe("Привет 😀 мир");
  });

  it("draws node classes, suggested blocks and the Placeholder text", async () => {
    const { editor, root, block } = await mount(
      [paragraph("p", "")],
      [Paragraph, Placeholder.configure({ text: "Пишите…" })],
    );
    expect(block("p").getAttribute("data-placeholder")).toBe("Пишите…");
    editor.setDecorations("review", [
      { type: "node", key: "n", blockId: "p", className: "is-reviewed", attrs: { "data-r": "1" } },
      {
        type: "blocks",
        key: "s",
        blockId: "p",
        position: "after",
        className: "is-proposed",
        blocks: [
          {
            id: "new",
            type: "paragraph",
            attrs: {},
            content: [{ text: "Новый", marks: [] }],
            children: [],
            decorations: [],
          },
        ],
      },
    ]);
    await nextTick();
    expect(block("p").classList.contains("is-reviewed")).toBe(true);
    expect(block("p").getAttribute("data-r")).toBe("1");
    const phantom = root.querySelector<HTMLElement>('[data-gotipe-phantom-id="new"]')!;
    expect(phantom.classList.contains("is-proposed")).toBe(true);
    expect(phantom.getAttribute("contenteditable")).toBe("false");
    expect(phantom.textContent).toBe("Новый");
    expect(block("p").nextElementSibling).toBe(phantom);
    editor.setEditable(false);
    await nextTick();
    expect(block("p").hasAttribute("data-placeholder")).toBe(false);
  });

  it("draws the search, invisible-character and focus layers and alignment", async () => {
    const { editor, block } = await mount(
      [paragraph("a", "кот и кот")],
      [
        Paragraph,
        FindReplace,
        InvisibleCharacters,
        Focus.configure({ onlyWhenFocused: false }),
        TextAlign,
      ],
    );
    getFindReplace(editor)!.setSearch({ query: "кот" });
    setInvisibleCharacters(editor, true);
    setTextAlign(editor, "right");
    await nextTick();
    expect(
      [...block("a").querySelectorAll("[data-gotipe-search-match]")].map((m) => m.className),
    ).toEqual(["gotipe-match is-current", "gotipe-match"]);
    expect(block("a").querySelectorAll(".gotipe-sp")).toHaveLength(2);
    expect(block("a").querySelector(".gotipe-pilcrow[data-gotipe-widget]")).not.toBeNull();
    expect(block("a").classList.contains("has-focus")).toBe(true);
    expect(block("a").getAttribute("data-align")).toBe("right");
    expect(block("a").style.textAlign).toBe("right");
    expect(ownText(block("a"))).toBe("кот и кот");
  });

  it("leaves host layers out and takes placeholder words from the host", async () => {
    const { editor, block } = await mount([paragraph("p", "")], [Paragraph, Placeholder], {
      hostLayers: ["collaboration"],
      placeholder: (item: { type: string }) => (item.type === "paragraph" ? "Напишите…" : null),
    });
    // Without configured text the decoration has no words; the host's function supplies them.
    expect(editor.getDecorations()).toEqual([{ type: "placeholder", text: "", blockId: "p" }]);
    expect(block("p").getAttribute("data-placeholder")).toBe("Напишите…");
    editor.setDecorations("collaboration", [
      {
        type: "remote-cursor",
        peerId: "ann",
        blockId: "p",
        offset: 0,
        user: { name: "Аня", color: "#2c62d4" },
      },
    ]);
    editor.setDecorations("review", [{ type: "node", key: "n", blockId: "p", className: "kept" }]);
    await nextTick();
    expect(block("p").querySelector(".gotipe-remote-cursor")).toBeNull();
    expect(block("p").classList.contains("kept")).toBe(true);

    const plain = await mount([paragraph("q", "")], [Paragraph, Placeholder]);
    expect(plain.block("q").hasAttribute("data-placeholder")).toBe(false);
  });

  it("keeps the native caret when only a decoration layer changes", async () => {
    const { editor, root } = await mount([paragraph("p", "hello world")]);
    root.querySelector<HTMLElement>("[data-gotipe-content]")!.focus();
    editor.setSelection({ anchor: { blockId: "p", offset: 8 }, head: { blockId: "p", offset: 8 } });
    await nextTick();
    expect(editor.getDOMSelection()?.head).toEqual({ blockId: "p", offset: 8 });
    for (const offset of [2, 7, 9]) {
      editor.setDecorations("collaboration", [
        {
          type: "remote-cursor",
          peerId: "ann",
          blockId: "p",
          offset,
          user: { name: "Ann", color: "#2c62d4" },
        },
      ]);
      await nextTick();
      expect(editor.getDOMSelection()?.head).toEqual({ blockId: "p", offset: 8 });
    }
  });

  it("holds the composing block's decorations and the native selection until the IME ends", async () => {
    const { editor, root, block } = await mount([
      paragraph("p", "hello world"),
      paragraph("q", "other"),
    ]);
    root.querySelector<HTMLElement>("[data-gotipe-content]")!.focus();
    editor.setSelection({ anchor: { blockId: "p", offset: 5 }, head: { blockId: "p", offset: 5 } });
    await nextTick();
    const setSelection = vi.spyOn(editor, "setSelection");
    const caret = (blockId: string, offset: number) => ({
      type: "remote-cursor" as const,
      peerId: "ann",
      blockId,
      offset,
      user: { name: "Ann", color: "#2c62d4" },
    });
    const text = block("p").firstChild!;
    // Another person's caret moves through the paragraph as the IME starts in it: Vue patches
    // the change only once the composition is running.
    editor.setDecorations("collaboration", [caret("p", 2), caret("q", 1)]);
    text.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    await nextTick();
    expect(editor.isComposing).toBe(true);
    expect(block("p").querySelector(".gotipe-remote-cursor")).toBeNull();
    expect(block("p").firstChild).toBe(text);
    expect(block("q").querySelector(".gotipe-remote-cursor")).not.toBeNull();
    editor.setDecorations("collaboration", [caret("p", 7)]);
    await nextTick();
    expect(block("p").querySelector(".gotipe-remote-cursor")).toBeNull();
    expect(setSelection).not.toHaveBeenCalled();
    text.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" }));
    await nextTick();
    expect(editor.isComposing).toBe(false);
    const drawn = block("p").querySelector(".gotipe-remote-cursor")!;
    const before = document.createRange();
    before.setStart(block("p"), 0);
    before.setEndBefore(drawn);
    expect(before.toString()).toBe("hello w");
    expect(ownText(block("p"))).toBe("hello world");
  });
});
