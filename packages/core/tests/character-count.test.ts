import { afterEach, describe, expect, it, vi } from "vitest";
import { ClipboardHandler } from "../src/clipboard/handler";
import { clipboardOptions } from "../src/editor/clipboard-options";
import {
  CharacterCount,
  CodeBlock,
  Paragraph,
  countCharacters,
  countWords,
  fitCharacters,
  getCharacterCount,
} from "../src/extensions";
import type { GoTipeEditor } from "../src/types/editor";
import { ENGINES, block, createOn, doc, mountForTyping, paragraph } from "./engines";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function paste(editor: GoTipeEditor, plain: string, html = "") {
  const handler = new ClipboardHandler(
    editor,
    clipboardOptions([CharacterCount, Paragraph], async () => {
      throw new Error("no drafts");
    }),
  );
  handler.onPaste({
    preventDefault() {},
    clipboardData: {
      files: [],
      getData: (type: string) => (type === "text/plain" ? plain : type === "text/html" ? html : ""),
    },
  } as unknown as ClipboardEvent);
}

describe("character and word counting", () => {
  it("counts grapheme clusters, never half of a surrogate pair", () => {
    expect(countCharacters("ёлка")).toBe(4);
    expect(countCharacters("й")).toBe(1); // и + combining breve
    expect(countCharacters("👍🏽🇷🇺👨‍👩‍👧")).toBe(3);
    expect(fitCharacters("a👍🏽b", 2)).toBe("a👍🏽");
    expect(fitCharacters("😀😀", 1)).toBe("😀");
    expect(fitCharacters("abc", 0)).toBe("");
    expect(countWords("Привет, мир! Don't stop 3.14")).toBe(5);
  });

  it("falls back without Intl.Segmenter", async () => {
    vi.stubGlobal("Intl", Object.assign(Object.create(Intl), { Segmenter: undefined }));
    vi.resetModules();
    const count = await import("../src/extensions/character-count/count");
    expect(count.countCharacters("й👍🏽🇷🇺🇩🇪👨‍👩‍👧\r\n")).toBe(6);
    expect(count.fitCharacters("a👍🏽🇷🇺b", 2)).toBe("a👍🏽");
    expect(count.fitCharacters("😀😀", 1)).toBe("😀");
    expect(count.countWords("Привет, мир! Don't stop 3.14")).toBe(5);
  });
});

describe.each(ENGINES)("%s character count", (engine) => {
  async function setup(limit: number | null, ...blocks: Parameters<typeof doc>) {
    const errors: unknown[] = [];
    const editor = await createOn(engine, {
      extensions: [Paragraph, CodeBlock, CharacterCount.configure({ limit })],
      content: doc(...blocks),
      host: { onError: (error) => errors.push(error) },
    });
    cleanups.push(() => editor.destroy());
    return { editor, count: getCharacterCount(editor)!, errors };
  }

  it("counts all text blocks and notifies after each change", async () => {
    const { editor, count } = await setup(
      null,
      paragraph("a", "Два слова"),
      block("c", "codeBlock", "x = 1", { language: "" }),
    );
    expect(count.getState()).toEqual({ characters: 14, words: 4, limit: null, remaining: null });
    const listener = vi.fn();
    count.subscribe(listener);
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "a", offset: 9, text: " 😀", marks: [] }],
    });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ characters: 16, words: 4 }));
    editor.undo();
    expect(count.characters()).toBe(14);
  });

  it("rejects typing past the limit and allows shrinking above it", async () => {
    const { editor, count } = await setup(3, paragraph("a", "ab"));
    const typing = mountForTyping(editor);
    cleanups.push(() => typing.element.remove());
    typing.caret("a", 2);
    typing.type("😀");
    expect(editor.getText()).toBe("ab😀");
    typing.type("c");
    expect(editor.getText()).toBe("ab😀");
    expect(count.getState()).toMatchObject({ characters: 3, remaining: 0 });
    expect(
      editor.dispatch({
        steps: [{ type: "insertText", blockId: "a", offset: 0, text: "x", marks: [] }],
      }),
    ).toBe(false);
    editor.setContent(doc(paragraph("a", "abcdef")));
    expect(count.getState().remaining).toBe(-3);
    expect(editor.dispatch({ steps: [{ type: "deleteText", blockId: "a", from: 0, to: 1 }] })).toBe(
      true,
    );
  });

  it("cuts pasted plain text at a cluster boundary, counting the replaced selection", async () => {
    const { editor } = await setup(6, paragraph("a", "abc"));
    editor.setSelection({ anchor: { blockId: "a", offset: 3 }, head: { blockId: "a", offset: 3 } });
    paste(editor, "👍🏽👍🏽👍🏽👍🏽");
    expect(editor.getText()).toBe("abc👍🏽👍🏽👍🏽");
    expect(editor.undo()).toBe(true);
    editor.setSelection({ anchor: { blockId: "a", offset: 1 }, head: { blockId: "a", offset: 3 } });
    paste(editor, "XYZWV");
    expect(editor.getText()).toBe("aXYZWV");
    // HTML is not cut: a paste over the limit is rejected as a whole.
    editor.undo();
    paste(editor, "", "<p>0123456789</p>");
    expect(editor.getText()).toBe("abc");
  });
});
