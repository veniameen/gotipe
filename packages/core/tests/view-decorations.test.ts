import { afterEach, describe, expect, it } from "vitest";
import {
  BulletList,
  Focus,
  InvisibleCharacters,
  ListItem,
  Paragraph,
  isInvisibleCharactersVisible,
  setInvisibleCharacters,
  toggleInvisibleCharacters,
} from "../src/extensions";
import type { GoTipeEditor } from "../src/types/editor";
import { ENGINES, block, createOn, doc, paragraph, text } from "./engines";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe.each(ENGINES)("%s invisible characters", (engine) => {
  it("shows spaces, no-break spaces, line breaks and block ends only while on", async () => {
    const editor = await createOn(engine, {
      extensions: [Paragraph, InvisibleCharacters],
      content: doc(paragraph("a", "a b\u00a0😀\nc"), paragraph("b", "")),
    });
    cleanups.push(() => editor.destroy());
    expect(isInvisibleCharactersVisible(editor)).toBe(false);
    expect(editor.getDecorations("invisibles")).toEqual([]);
    expect(toggleInvisibleCharacters(editor)).toBe(true);
    const shown = editor
      .getDecorations("invisibles")
      .map((item) =>
        item.type === "inline"
          ? [item.blockId, item.from, item.className, item.attrs?.["data-gotipe-invisible"]]
          : item.type === "widget"
            ? [item.blockId, item.offset, item.className]
            : null,
      );
    expect(shown).toEqual([
      ["a", 1, "gotipe-sp", "space"],
      ["a", 3, "gotipe-nbsp", "nbsp"],
      ["a", 6, "gotipe-br", "break"],
      ["a", 8, "gotipe-pilcrow"],
      ["b", 0, "gotipe-pilcrow"],
    ]);
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "b", offset: 0, text: "x y", marks: [] }],
    });
    expect(editor.getDecorations("invisibles").filter((item) => item.blockId === "b")).toHaveLength(
      2,
    );
    expect(editor.getText()).toBe("a b\u00a0😀\nc\nx y");
    setInvisibleCharacters(editor, false);
    expect(editor.getDecorations("invisibles")).toEqual([]);
  });

  it("starts visible when configured and clears its layer on destroy", async () => {
    const editor = await createOn(engine, {
      extensions: [Paragraph, InvisibleCharacters.configure({ visible: true })],
      content: doc(paragraph("a", "a")),
    });
    expect(editor.getDecorations("invisibles")).toHaveLength(1);
    editor.destroy();
    expect(editor.getDecorations("invisibles")).toEqual([]);
    expect(setInvisibleCharacters(editor, true)).toBe(false);
  });
});

describe.each(ENGINES)("%s focus", (engine) => {
  async function setup(mode: "deepest" | "all" | "shallowest" = "deepest") {
    const editor = await createOn(engine, {
      extensions: [Paragraph, BulletList, ListItem, Focus.configure({ mode })],
      content: doc(
        paragraph("p", "a"),
        block("l", "bulletList", null, {}, [block("i", "listItem", text("b"))]),
      ),
    });
    const root = document.createElement("div");
    document.body.append(root);
    editor.mount(root);
    cleanups.push(() => {
      editor.destroy();
      root.remove();
    });
    const focused = () =>
      editor
        .getDecorations("focus")
        .map((item) => [item.blockId, item.type === "node" && item.className]);
    return { editor, root, focused };
  }
  const caret = (editor: GoTipeEditor, blockId: string) =>
    editor.setSelection({ anchor: { blockId, offset: 0 }, head: { blockId, offset: 0 } });

  it("marks the block with the caret while the editor has focus", async () => {
    const { editor, root, focused } = await setup();
    expect(focused()).toEqual([]);
    root.dispatchEvent(new FocusEvent("focus"));
    expect(focused()).toEqual([["p", "has-focus"]]);
    caret(editor, "i");
    expect(focused()).toEqual([["i", "has-focus"]]);
    root.dispatchEvent(new FocusEvent("blur"));
    expect(focused()).toEqual([]);
  });

  it("marks ancestors in all mode and the top block in shallowest mode", async () => {
    const all = await setup("all");
    all.root.dispatchEvent(new FocusEvent("focus"));
    caret(all.editor, "i");
    expect(all.focused()).toEqual([
      ["l", "has-focus"],
      ["i", "has-focus"],
    ]);
    const top = await setup("shallowest");
    top.root.dispatchEvent(new FocusEvent("focus"));
    caret(top.editor, "i");
    expect(top.focused()).toEqual([["l", "has-focus"]]);
  });
});

describe.each(ENGINES)("%s composition and decoration layers", (engine) => {
  it("reports `isComposing` and draws layer changes after the composition", async () => {
    const editor = await createOn(engine, {
      extensions: [Paragraph],
      content: doc(paragraph("p", "hello")),
    });
    const root = document.createElement("div");
    document.body.append(root);
    cleanups.push(() => {
      editor.destroy();
      root.remove();
    });
    expect(editor.isComposing).toBe(false);
    editor.mount(root);
    editor.setSelection({ anchor: { blockId: "p", offset: 2 }, head: { blockId: "p", offset: 2 } });
    root.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    expect(editor.isComposing).toBe(true);
    const caret = { type: "widget" as const, key: "c", blockId: "p", offset: 1, className: "x" };
    editor.setDecorations("collaboration", [caret]);
    expect(editor.getDecorations("collaboration")).toEqual([]);
    root.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" }));
    expect(editor.isComposing).toBe(false);
    expect(editor.getDecorations("collaboration")).toEqual([caret]);
  });
});
