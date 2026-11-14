import { afterEach, describe, expect, it } from "vitest";
import {
  Bold,
  CharacterCount,
  CodeBlock,
  Divider,
  InlineCode,
  Paragraph,
  Typography,
} from "../src/extensions";
import type { Mark } from "../src/types/block";
import type { Extension } from "../src/types/extension";
import { ENGINES, block, createOn, doc, mountForTyping, paragraph } from "./engines";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe.each(ENGINES)("%s typography", (engine) => {
  async function typing(initial = "", typography: Extension = Typography, marks: Mark[] = []) {
    const editor = await createOn(engine, {
      extensions: [Divider, Paragraph, Bold, InlineCode, CodeBlock, typography],
      content: doc(paragraph("p", initial ? [{ text: initial, marks }] : [])),
    });
    const surface = mountForTyping(editor);
    cleanups.push(() => surface.remove());
    surface.caret("p", initial.length);
    return { editor, type: surface.type, text: () => editor.getText() };
  }

  it.each([
    ['He said "hi" -- it\'s 2x3...', "He said “hi” — it’s 2×3…"],
    ["a - b -> c <- d => e", "a – b → c ← d ⇒ e"],
    ["(c) (R) (tm) 1/2 cup", "© ® ™ ½ cup"],
    ["1/23 0x1F a2x3", "1/23 0x1F a2x3"],
  ])("en: %s", async (typed, expected) => {
    const { type, text } = await typing();
    type(typed);
    expect(text()).toBe(expected);
  });

  it("runs no rule on the text when a limit rejects the typed character", async () => {
    const editor = await createOn(engine, {
      extensions: [Paragraph, Typography, CharacterCount.configure({ limit: 3 })],
      content: doc(paragraph("p", [])),
    });
    const surface = mountForTyping(editor);
    cleanups.push(() => surface.remove());
    surface.caret("p", 0);
    surface.type("a--");
    expect(editor.getText()).toBe("a—");
    // Undo takes the dash back to what was typed, three characters: the limit.
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("a--");
    surface.caret("p", 3);
    surface.type("x");
    expect(editor.getText()).toBe("a--");
  });

  it("ru: guillemets with nested quotes and a spaced em dash", async () => {
    const { type, text } = await typing("", Typography.configure({ locale: "ru" }));
    type('Он сказал: "это "ёлка" - 2х3"');
    expect(text()).toBe("Он сказал: «это „ёлка“ — 2×3»");
  });

  it("undo right after a replacement brings back the typed text in one step", async () => {
    const { editor, type, text } = await typing("Ждём");
    type("...");
    expect(text()).toBe("Ждём…");
    expect(editor.undo()).toBe(true);
    expect(text()).toBe("Ждём...");
    expect(editor.redo()).toBe(true);
    expect(text()).toBe("Ждём…");
  });

  it("keeps the marks of the replaced text and the emoji before it", async () => {
    const bold: Mark = { type: "bold", attrs: {} };
    const { editor, type } = await typing("😀a-", Typography, [bold]);
    type(">");
    expect(editor.getJSON().blocks[0]!.content).toEqual([{ text: "😀a→", marks: [bold] }]);
    expect(editor.getViewState().selection.head.offset).toBe(4);
  });

  it("leaves inline code, code blocks, addresses and the divider shortcut alone", async () => {
    const code: Mark = { type: "code", attrs: {} };
    const inCode = await typing("x", Typography, [code]);
    inCode.type("--");
    expect(inCode.editor.getJSON().blocks[0]!.content).toEqual([{ text: "x--", marks: [code] }]);

    const url = await typing("see https://a.b/c");
    url.type('--x"');
    expect(url.text()).toBe('see https://a.b/c--x"');

    // A quote around an address still closes: the address itself stays as typed.
    const quoted = await typing();
    quoted.type('see "https://example.com/x--y" ok');
    expect(quoted.text()).toBe("see “https://example.com/x--y” ok");
    const ru = await typing("", Typography.configure({ locale: "ru" }));
    ru.type('см. "www.example.ru" и "о "mailto:a@b.ru""');
    expect(ru.text()).toBe("см. «www.example.ru» и «о „mailto:a@b.ru“»");

    const divider = await typing();
    divider.type("---");
    expect(divider.editor.getJSON().blocks.map((item) => item.type)).toEqual([
      "divider",
      "paragraph",
    ]);

    const editor = await createOn(engine, {
      extensions: [Paragraph, CodeBlock, Typography],
      content: doc(block("c", "codeBlock", "a", { language: "" })),
    });
    const surface = mountForTyping(editor);
    cleanups.push(() => surface.remove());
    surface.caret("c", 1);
    surface.type('--"...');
    expect(editor.getText()).toBe('a--"...');
  });

  it("can turn single rules off", async () => {
    const { type, text } = await typing("", Typography.configure({ arrows: false, quotes: false }));
    type('-> "x"...');
    expect(text()).toBe('-> "x"…');
  });
});
