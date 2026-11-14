import { afterEach, describe, expect, it } from "vitest";
import { GoTipeError } from "../src/error";
import {
  Blockquote,
  BulletList,
  Heading,
  ListItem,
  Paragraph,
  TEXT_DIRECTIONS,
  TextAlign,
  TextDirection,
  TodoList,
  getTextDirection,
  setTextAlign,
  setTextDirection,
  unsetTextDirection,
} from "../src/extensions";
import type { Document } from "../src/types/block";
import {
  ENGINES,
  type Engine,
  block,
  createOn,
  doc,
  mountForTyping,
  paragraph,
  text,
} from "./engines";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const ARABIC = "مرحبا 😀 بالعالم";

async function setup(engine: Engine, content: Document) {
  const editor = await createOn(engine, {
    extensions: [
      Paragraph,
      Heading,
      Blockquote,
      BulletList,
      ListItem,
      TodoList,
      TextAlign,
      TextDirection,
    ],
    content,
  });
  cleanups.push(() => editor.destroy());
  return editor;
}

const mixed = () =>
  doc(
    block("h", "heading", text("Заголовок"), { level: 2 }),
    paragraph("p", ARABIC),
    block("l", "bulletList", null, {}, [block("i", "listItem", text("пункт"))]),
    block("q", "blockquote", text("цитата")),
  );

describe.each(ENGINES)("%s text direction", (engine) => {
  const dirs = (editor: Awaited<ReturnType<typeof setup>>) => {
    const out: (string | null)[] = [];
    const visit = (blocks: Document["blocks"]) => {
      for (const item of blocks) {
        out.push((item.attrs.dir as string | undefined) ?? null);
        visit(item.children);
      }
    };
    visit(editor.getJSON().blocks);
    return out;
  };

  it("sets the direction of every selected block that declares it in one undo step", async () => {
    const editor = await setup(engine, mixed());
    expect(TEXT_DIRECTIONS).toEqual(["ltr", "rtl", "auto"]);
    editor.setSelection({ anchor: { blockId: "q", offset: 2 }, head: { blockId: "h", offset: 1 } });
    expect(setTextDirection(editor, "rtl")).toBe(true);
    // heading, paragraph, bulletList, listItem, blockquote
    expect(dirs(editor)).toEqual(["rtl", "rtl", null, "rtl", null]);
    expect(getTextDirection(editor)).toBeNull(); // the caret is in the blockquote
    expect(setTextDirection(editor, "rtl")).toBe(false);
    expect(setTextDirection(editor, "bidi" as never)).toBe(false);
    expect(editor.undo()).toBe(true);
    expect(dirs(editor)).toEqual([null, null, null, null, null]);
    expect(editor.undo()).toBe(false);

    editor.setSelection({ anchor: { blockId: "p", offset: 0 }, head: { blockId: "p", offset: 0 } });
    expect(setTextDirection(editor, "auto")).toBe(true);
    expect(getTextDirection(editor)).toBe("auto");
    expect(unsetTextDirection(editor)).toBe(true);
    expect(getTextDirection(editor)).toBeNull();
    expect(unsetTextDirection(editor)).toBe(false);
    editor.setEditable(false);
    expect(setTextDirection(editor, "rtl")).toBe(false);
  });

  it("validates the attribute", async () => {
    const editor = await setup(engine, mixed());
    const set = (blockId: string, dir: string) => () =>
      editor.dispatch({ steps: [{ type: "setBlockAttrs", blockId, attrs: { dir } }] });
    expect(set("p", "rtl-ish")).toThrow(GoTipeError);
    expect(set("q", "rtl")).toThrow(GoTipeError);
    expect(set("i", "ltr")()).toBe(true);
  });

  it("keeps the direction when a block changes type", async () => {
    const editor = await setup(engine, mixed());
    const surface = mountForTyping(editor);
    cleanups.push(() => surface.element.remove());
    surface.caret("p", 0);
    setTextDirection(editor, "rtl");
    setTextAlign(editor, "right");
    editor.chain().setBlockType("heading", { level: 3 }).run();
    expect(editor.getJSON().blocks[1]).toMatchObject({
      type: "heading",
      attrs: { level: 3, align: "right", dir: "rtl" },
    });
    editor.chain().setBlockType("paragraph").run();
    expect(editor.getJSON().blocks[1]!.attrs).toEqual({ align: "right", dir: "rtl" });
    editor.chain().toggleBulletList().run();
    expect(editor.getJSON().blocks[1]!.children[0]).toMatchObject({
      id: "p",
      type: "listItem",
      attrs: { dir: "rtl" },
    });
    editor.chain().toggleTodoList().run();
    expect(editor.getJSON().blocks[1]!.children[0]).toMatchObject({
      id: "p",
      type: "todoItem",
      attrs: { dir: "rtl", checked: false },
    });
    editor.chain().toggleTodoList().run();
    expect(editor.getJSON().blocks[1]).toMatchObject({
      id: "p",
      type: "paragraph",
      attrs: { dir: "rtl" },
    });
    expect(editor.chain().setBlockType("blockquote").run()).toBe(true);
    expect("dir" in editor.getJSON().blocks[1]!.attrs).toBe(false);

    const typed = await setup(engine, doc(paragraph("p", "", { dir: "rtl" })));
    const typing = mountForTyping(typed);
    cleanups.push(() => typing.element.remove());
    typing.caret("p", 0);
    typing.type("## ");
    expect(typed.getJSON().blocks[0]).toMatchObject({
      type: "heading",
      attrs: { level: 2, dir: "rtl" },
    });
  });

  it("edits right-to-left text by logical UTF-16 offsets", async () => {
    const editor = await setup(engine, doc(paragraph("p", ARABIC, { dir: "rtl" })));
    const surface = mountForTyping(editor);
    cleanups.push(() => surface.element.remove());
    const input = (inputType: string) =>
      surface.element.dispatchEvent(
        new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType }),
      );
    const value = () => (editor.getJSON().blocks[0]!.content as { text: string }[])[0]!.text;
    const caret = () => editor.getViewState().selection.anchor.offset;
    // After "مرحبا " and the emoji (2 UTF-16 units): offset 8.
    surface.caret("p", 8);
    input("deleteContentBackward");
    expect(value()).toBe("مرحبا  بالعالم");
    expect(caret()).toBe(6);
    input("deleteContentBackward");
    expect(value()).toBe("مرحبا بالعالم");
    expect(caret()).toBe(5);
    input("deleteContentForward");
    expect(value()).toBe("مرحبابالعالم");
    expect(caret()).toBe(5);
    // A backward selection (head before anchor) is replaced by typed text.
    editor.setSelection({ anchor: { blockId: "p", offset: 9 }, head: { blockId: "p", offset: 5 } });
    surface.type("ي");
    expect(value()).toBe("مرحبايالم");
    expect(caret()).toBe(6);
    expect(editor.getJSON().blocks[0]!.attrs).toEqual({ dir: "rtl" });
  });

  it("writes dir to HTML before the alignment; Markdown has no syntax for it", async () => {
    const editor = await setup(engine, mixed());
    const plain = editor.getMarkdown();
    editor.setSelection({ anchor: { blockId: "h", offset: 0 }, head: { blockId: "i", offset: 2 } });
    setTextDirection(editor, "rtl");
    setTextAlign(editor, "right");
    expect(editor.getHTML()).toBe(
      `<h2 dir="rtl" style="text-align:right">Заголовок</h2>\n<p dir="rtl" style="text-align:right">${ARABIC}</p>\n<ul>\n<li dir="rtl">пункт</li>\n</ul>\n<blockquote>цитата</blockquote>`,
    );
    expect(editor.getMarkdown()).toBe(plain);
  });
});
