import { afterEach, describe, expect, it } from "vitest";
import { GoTipeError } from "../src/error";
import {
  Blockquote,
  BulletList,
  Heading,
  ListItem,
  Paragraph,
  TextAlign,
  getTextAlign,
  setTextAlign,
  unsetTextAlign,
} from "../src/extensions";
import { ENGINES, block, createOn, doc, mountForTyping, paragraph, text } from "./engines";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe.each(ENGINES)("%s text alignment", (engine) => {
  async function setup() {
    const editor = await createOn(engine, {
      extensions: [Paragraph, Heading, Blockquote, BulletList, ListItem, TextAlign],
      content: doc(
        block("h", "heading", text("Заголовок"), { level: 2 }),
        paragraph("p", "Абзац 😀"),
        block("l", "bulletList", null, {}, [block("i", "listItem", text("пункт"))]),
      ),
    });
    cleanups.push(() => editor.destroy());
    return editor;
  }
  const aligns = (editor: Awaited<ReturnType<typeof setup>>) =>
    editor.getJSON().blocks.map((item) => item.attrs.align ?? null);

  it("aligns every selected paragraph and heading in one undo step", async () => {
    const editor = await setup();
    editor.setSelection({ anchor: { blockId: "p", offset: 3 }, head: { blockId: "h", offset: 1 } });
    expect(setTextAlign(editor, "center")).toBe(true);
    expect(aligns(editor)).toEqual(["center", "center", null]);
    expect(getTextAlign(editor)).toBe("center");
    expect(setTextAlign(editor, "center")).toBe(false);
    expect(editor.undo()).toBe(true);
    expect(aligns(editor)).toEqual([null, null, null]);
    expect(editor.undo()).toBe(false);
  });

  it("returns to the default, keeps alignment across Enter and validates the value", async () => {
    const editor = await setup();
    editor.setSelection({ anchor: { blockId: "p", offset: 0 }, head: { blockId: "p", offset: 0 } });
    setTextAlign(editor, "justify");
    editor.dispatch({ steps: [{ type: "splitBlock", blockId: "p", offset: 5 }] });
    expect(editor.getJSON().blocks[2]!.attrs.align).toBe("justify");
    expect(unsetTextAlign(editor)).toBe(true);
    expect(editor.getJSON().blocks[1]!.attrs.align).toBeNull();
    expect(() =>
      editor.dispatch({
        steps: [{ type: "setBlockAttrs", blockId: "p", attrs: { align: "middle" } }],
      }),
    ).toThrow(GoTipeError);
    expect(() =>
      editor.dispatch({
        steps: [{ type: "setBlockAttrs", blockId: "i", attrs: { align: "left" } }],
      }),
    ).toThrow(GoTipeError);
    expect(editor.getMarkdown()).toContain("Абзац");
  });

  it("keeps alignment when a paragraph becomes a heading and back, by command and by typing", async () => {
    const editor = await setup();
    const surface = mountForTyping(editor);
    cleanups.push(() => surface.element.remove());
    surface.caret("p", 0);
    setTextAlign(editor, "center");
    expect(editor.chain().setBlockType("heading", { level: 3 }).run()).toBe(true);
    expect(editor.getJSON().blocks[1]).toMatchObject({
      type: "heading",
      attrs: { level: 3, align: "center" },
    });
    expect(editor.chain().setBlockType("paragraph").run()).toBe(true);
    expect(editor.getJSON().blocks[1]).toMatchObject({
      type: "paragraph",
      attrs: { align: "center" },
    });
    // An explicit value wins; a type without the attribute drops it instead of failing.
    editor.chain().setBlockType("heading", { level: 1, align: "right" }).run();
    expect(editor.getJSON().blocks[1]!.attrs).toEqual({ level: 1, align: "right" });
    editor.chain().setBlockType("paragraph").run();
    expect(editor.chain().setBlockType("blockquote").run()).toBe(true);
    expect(editor.getJSON().blocks[1]).toMatchObject({ type: "blockquote", attrs: {} });
    expect("align" in editor.getJSON().blocks[1]!.attrs).toBe(false);

    const typed = await setup();
    const typing = mountForTyping(typed);
    cleanups.push(() => typing.element.remove());
    typed.dispatch({
      steps: [
        { type: "deleteText", blockId: "p", from: 0, to: 8 },
        { type: "setBlockAttrs", blockId: "p", attrs: { align: "justify" } },
      ],
    });
    typing.caret("p", 0);
    typing.type("## ");
    expect(typed.getJSON().blocks[1]).toMatchObject({
      type: "heading",
      attrs: { level: 2, align: "justify" },
      content: [],
    });
  });

  it("writes alignment to HTML; Markdown has no syntax for it", async () => {
    const editor = await setup();
    const plain = editor.getMarkdown();
    editor.setSelection({ anchor: { blockId: "h", offset: 0 }, head: { blockId: "p", offset: 2 } });
    setTextAlign(editor, "right");
    expect(editor.getHTML()).toBe(
      '<h2 style="text-align:right">Заголовок</h2>\n<p style="text-align:right">Абзац 😀</p>\n<ul>\n<li>пункт</li>\n</ul>',
    );
    expect(editor.getMarkdown()).toBe(plain);
    expect(plain).toBe("## Заголовок\n\nАбзац 😀\n\n- пункт\n");
    unsetTextAlign(editor);
    expect(editor.getHTML()).toContain("<p>Абзац 😀</p>");
  });

  it("binds Mod+Shift+L/E/R/J and keeps the browser key out while a block is aligned", async () => {
    const editor = await setup();
    const surface = mountForTyping(editor);
    cleanups.push(() => surface.element.remove());
    surface.caret("h", 2);
    const mod = navigator.platform.includes("Mac") ? { metaKey: true } : { ctrlKey: true };
    for (const [key, value] of [
      ["R", "right"],
      ["E", "center"],
      ["J", "justify"],
      ["L", "left"],
    ] as const) {
      const event = surface.key(key, { ...mod, shiftKey: true, code: `Key${key}` });
      expect(event.defaultPrevented).toBe(true);
      expect(editor.getJSON().blocks[0]!.attrs.align).toBe(value);
    }
    expect(surface.key("L", { ...mod, shiftKey: true, code: "KeyL" }).defaultPrevented).toBe(true);
    surface.caret("i", 1);
    expect(surface.key("E", { ...mod, shiftKey: true, code: "KeyE" }).defaultPrevented).toBe(false);
  });
});
