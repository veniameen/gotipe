import { afterEach, describe, expect, it } from "vitest";
import { GoTipeError } from "../src/error";
import {
  Bold,
  FONT_FAMILIES,
  FONT_SIZE_LIMITS,
  FontFamily,
  FontSize,
  Paragraph,
  getFontFamily,
  getFontSize,
  setFontFamily,
  setFontSize,
  unsetFontFamily,
  unsetFontSize,
} from "../src/extensions";
import type { Extension } from "../src/types/extension";
import { ENGINES, createOn, doc, mountForTyping, paragraph } from "./engines";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const family = (name: string) => ({ type: "fontFamily", attrs: { family: name } });
const size = (px: number) => ({ type: "fontSize", attrs: { size: px } });

describe.each(ENGINES)("%s font family and size", (engine) => {
  async function setup(extensions: Extension[] = [FontFamily, FontSize]) {
    const editor = await createOn(engine, {
      extensions: [Paragraph, Bold, ...extensions],
      content: doc(paragraph("a", "Шрифт 😀 текст"), paragraph("b", "второй")),
    });
    cleanups.push(() => editor.destroy());
    return editor;
  }
  const select = (
    editor: Awaited<ReturnType<typeof setup>>,
    anchor: [string, number],
    head: [string, number] = anchor,
  ) =>
    editor.setSelection({
      anchor: { blockId: anchor[0], offset: anchor[1] },
      head: { blockId: head[0], offset: head[1] },
    });
  const content = (editor: Awaited<ReturnType<typeof setup>>, index = 0) =>
    editor.getJSON().blocks[index]!.content;

  it("sets, replaces and unsets the family of selected text in one undo step each", async () => {
    const editor = await setup();
    expect(FONT_FAMILIES).toEqual(["system", "serif", "mono"]);
    select(editor, ["a", 0], ["a", 8]);
    expect(setFontFamily(editor, "serif")).toBe(true);
    expect(content(editor)).toEqual([
      { text: "Шрифт 😀", marks: [family("serif")] },
      { text: " текст", marks: [] },
    ]);
    expect(getFontFamily(editor)).toBe("serif");
    // The same value again changes nothing and records no undo step.
    expect(setFontFamily(editor, "serif")).toBe(false);
    expect(setFontFamily(editor, "mono")).toBe(true);
    expect(content(editor)).toEqual([
      { text: "Шрифт 😀", marks: [family("mono")] },
      { text: " текст", marks: [] },
    ]);
    expect(unsetFontFamily(editor)).toBe(true);
    expect(unsetFontFamily(editor)).toBe(false);
    expect(content(editor)).toEqual([{ text: "Шрифт 😀 текст", marks: [] }]);
    expect(editor.undo()).toBe(true);
    expect(getFontFamily(editor)).toBe("mono");
    expect(editor.undo()).toBe(true);
    expect(content(editor)).toEqual([
      { text: "Шрифт 😀", marks: [family("serif")] },
      { text: " текст", marks: [] },
    ]);
    expect(editor.undo()).toBe(true);
    expect(content(editor)).toEqual([{ text: "Шрифт 😀 текст", marks: [] }]);
    expect(editor.undo()).toBe(false);
    expect(setFontFamily(editor, "comic" as never)).toBe(false);
  });

  it("formats a selection across blocks as one step and keeps other marks", async () => {
    const editor = await setup();
    editor.dispatch({
      steps: [{ type: "addMark", blockId: "b", from: 0, to: 6, mark: { type: "bold", attrs: {} } }],
    });
    select(editor, ["b", 3], ["a", 9]);
    expect(setFontSize(editor, 20)).toBe(true);
    expect(content(editor)).toEqual([
      { text: "Шрифт 😀 ", marks: [] },
      { text: "текст", marks: [size(20)] },
    ]);
    expect(content(editor, 1)).toEqual([
      { text: "вто", marks: [{ type: "bold", attrs: {} }, size(20)] },
      { text: "рой", marks: [{ type: "bold", attrs: {} }] },
    ]);
    expect(getFontSize(editor)).toBe(20);
    expect(editor.undo()).toBe(true);
    expect(content(editor)).toEqual([{ text: "Шрифт 😀 текст", marks: [] }]);
  });

  it("stores the mark at a caret for the text typed next", async () => {
    const editor = await setup();
    const surface = mountForTyping(editor);
    cleanups.push(() => surface.element.remove());
    surface.caret("b", 6);
    expect(getFontSize(editor)).toBeNull();
    expect(setFontSize(editor, 15.4)).toBe(true);
    expect(getFontSize(editor)).toBe(15);
    expect(setFontSize(editor, 15)).toBe(false);
    expect(setFontFamily(editor, "mono")).toBe(true);
    expect(getFontFamily(editor)).toBe("mono");
    // The caret mark replaces its own type only.
    expect(setFontFamily(editor, "serif")).toBe(true);
    surface.type("ы");
    expect(content(editor, 1)).toEqual([
      { text: "второй", marks: [] },
      { text: "ы", marks: [size(15), family("serif")] },
    ]);
    expect(getFontFamily(editor)).toBe("serif");
    expect(getFontSize(editor)).toBe(15);
    expect(unsetFontSize(editor)).toBe(true);
    expect(getFontSize(editor)).toBeNull();
    expect(unsetFontSize(editor)).toBe(false);
    surface.type("й");
    expect(content(editor, 1)).toEqual([
      { text: "второй", marks: [] },
      { text: "ы", marks: [size(15), family("serif")] },
      { text: "й", marks: [family("serif")] },
    ]);
  });

  it("rounds and clamps sizes to the extension's bounds", async () => {
    const editor = await setup();
    select(editor, ["a", 0], ["a", 5]);
    expect(setFontSize(editor, 200)).toBe(true);
    expect(getFontSize(editor)).toBe(48);
    expect(setFontSize(editor, 2)).toBe(true);
    expect(getFontSize(editor)).toBe(10);
    expect(setFontSize(editor, Number.NaN)).toBe(false);

    const custom = await setup([FontFamily, FontSize.configure({ min: 8, max: 72 })]);
    select(custom, ["a", 0], ["a", 5]);
    setFontSize(custom, 100);
    expect(getFontSize(custom)).toBe(72);
    const wide = await setup([FontFamily, FontSize.configure({ min: 1, max: 500 })]);
    select(wide, ["a", 0], ["a", 5]);
    setFontSize(wide, 500);
    expect(getFontSize(wide)).toBe(FONT_SIZE_LIMITS.max);
    setFontSize(wide, 1);
    expect(getFontSize(wide)).toBe(FONT_SIZE_LIMITS.min);
  });

  it("changes nothing in a read-only editor", async () => {
    const editor = await setup();
    select(editor, ["a", 0], ["a", 5]);
    editor.setEditable(false);
    expect(setFontFamily(editor, "serif")).toBe(false);
    expect(setFontSize(editor, 20)).toBe(false);
    expect(unsetFontFamily(editor)).toBe(false);
    expect(content(editor)).toEqual([{ text: "Шрифт 😀 текст", marks: [] }]);
    expect(editor.undo()).toBe(false);
  });

  it("validates the attributes in both engines", async () => {
    const editor = await setup();
    const add = (mark: { type: string; attrs: Record<string, unknown> }) => () =>
      editor.dispatch({ steps: [{ type: "addMark", blockId: "a", from: 0, to: 2, mark }] });
    expect(add(family("comic"))).toThrow(GoTipeError);
    expect(add({ type: "fontFamily", attrs: {} })).toThrow(GoTipeError);
    expect(add({ type: "fontSize", attrs: { size: "15px" } })).toThrow(GoTipeError);
    expect(add({ type: "fontSize", attrs: {} })).toThrow(GoTipeError);
    // A number outside the bounds is kept in the document; HTML leaves it out.
    expect(add(size(400))()).toBe(true);
    expect(editor.getHTML()).toBe("<p>Шрифт 😀 текст</p>\n<p>второй</p>");
    expect(content(editor)).toEqual([
      { text: "Шр", marks: [size(400)] },
      { text: "ифт 😀 текст", marks: [] },
    ]);
  });

  it("writes theme faces and sizes to HTML; Markdown has no syntax for them", async () => {
    const editor = await setup();
    const plain = editor.getMarkdown();
    select(editor, ["a", 0], ["a", 5]);
    setFontFamily(editor, "mono");
    setFontSize(editor, 18);
    expect(editor.getHTML()).toBe(
      '<p><span style="font-size:18px"><span style="font-family:monospace">Шрифт</span></span> 😀 текст</p>\n<p>второй</p>',
    );
    expect(editor.getMarkdown()).toBe(plain);
    expect(plain).toBe("Шрифт 😀 текст\n\nвторой\n");
  });
});
