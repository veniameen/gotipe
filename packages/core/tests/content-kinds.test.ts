import { afterEach, describe, expect, it } from "vitest";
import { GoTipeError } from "../src/error";
import { FullPreset } from "../src/presets";
import type { Document } from "../src/types/block";
import type { CreateEditorOptions, GoTipeEditor } from "../src/types/editor";
import { defineExtension } from "../src/types/extension";
import { ENGINES, type Engine, block, createOn, doc, paragraph, text } from "./engines";

/** Node types of your own (D-05): `snippet` holds raw text, `rule` has no content. */
const Custom = defineExtension({
  name: "custom-content-kinds",
  nodes: [
    {
      name: "snippet",
      group: ["block"],
      content: "rawText",
      attrs: {},
      topLevel: true,
      marksAllowed: "none",
      leaf: false,
      allowsChildren: false,
    },
    {
      name: "rule",
      group: ["block"],
      content: "empty",
      attrs: {},
      topLevel: true,
      marksAllowed: "none",
      leaf: true,
      allowsChildren: false,
    },
  ],
});

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

async function open(
  engine: Engine,
  content: Document,
  extensions: CreateEditorOptions["extensions"] = [FullPreset, Custom],
) {
  const editor = await createOn(engine, { extensions, content });
  editors.push(editor);
  return editor;
}

const caret = (editor: GoTipeEditor, blockId: string, offset = 0) =>
  editor.setSelection({ anchor: { blockId, offset }, head: { blockId, offset } });
const blocks = (editor: GoTipeEditor) => (editor.getJSON() as Document).blocks;
const bold = { type: "bold", attrs: {} };

/** The code a rejected dispatch throws; `null` when it went through. */
function rejection(editor: GoTipeEditor, steps: object[]): string | null {
  try {
    editor.dispatch({ steps } as Parameters<GoTipeEditor["dispatch"]>[0]);
    return null;
  } catch (error) {
    return error instanceof GoTipeError ? error.code : String(error);
  }
}

describe.each(ENGINES)(
  "%s engine: commands take the content kind from the schema (D-05)",
  (engine) => {
    it("insertBlockAfter and insertBlockBefore give your rawText node a string and your empty node none", async () => {
      const editor = await open(engine, doc(paragraph("p", "Text")));
      caret(editor, "p", 2);
      expect(editor.chain().insertBlockAfter("snippet").run()).toBe(true);
      expect(editor.chain().insertBlockBefore("rule").run()).toBe(true);
      expect(blocks(editor)).toMatchObject([
        { type: "rule", attrs: {}, content: null, children: [] },
        { id: "p", type: "paragraph", content: text("Text") },
        { type: "snippet", attrs: {}, content: "", children: [] },
      ]);
      const snippet = blocks(editor)[2]!.id;
      editor.dispatch({
        steps: [
          { type: "insertText", blockId: snippet, offset: 0, text: "\\frac{a}{b}", marks: [] },
        ],
      });
      expect(blocks(editor)[2]!.content).toBe("\\frac{a}{b}");
    });

    it("setBlockType turns a paragraph into your rawText node with its text, and back", async () => {
      const editor = await open(
        engine,
        doc(paragraph("p", [{ text: "Жирный", marks: [bold] }, ...text(" 😀 текст")])),
      );
      caret(editor, "p", 3);
      expect(editor.chain().setBlockType("snippet").run()).toBe(true);
      expect(blocks(editor)).toEqual([block("p", "snippet", "Жирный 😀 текст")]);
      expect(editor.chain().setBlockType("paragraph").run()).toBe(true);
      expect(blocks(editor)).toEqual([paragraph("p", "Жирный 😀 текст")]);
    });

    it("setBlockType turns a paragraph into your empty node, without its text", async () => {
      const editor = await open(engine, doc(paragraph("p", "Text"), paragraph("q", "Next")));
      caret(editor, "p", 2);
      expect(editor.chain().setBlockType("rule").run()).toBe(true);
      expect(blocks(editor)).toEqual([block("p", "rule", null), paragraph("q", "Next")]);
    });

    it("setBlockType lifts a list item into your rawText node and into your empty node", async () => {
      const item = (id: string, value: string) => block(id, "listItem", text(value));
      const list = block("list", "bulletList", null, {}, [item("a", "one"), item("b", "two")]);
      const editor = await open(engine, doc(list));
      caret(editor, "b", 1);
      expect(editor.chain().setBlockType("snippet").run()).toBe(true);
      expect(blocks(editor)).toEqual([
        { ...list, children: [item("a", "one")] },
        block("b", "snippet", "two"),
      ]);
      caret(editor, "a", 0);
      expect(editor.chain().setBlockType("rule").run()).toBe(true);
      expect(blocks(editor)).toEqual([block("a", "rule", null), block("b", "snippet", "two")]);
    });

    it("text typed, split or merged into your rawText node without content stays raw text", async () => {
      const editor = await open(
        engine,
        doc(block("s", "snippet", null), block("t", "snippet", null), block("u", "snippet", "u")),
      );
      editor.dispatch({
        steps: [{ type: "insertText", blockId: "s", offset: 0, text: "x", marks: [] }],
      });
      expect(blocks(editor)[0]).toEqual(block("s", "snippet", "x"));
      editor.dispatch({ steps: [{ type: "splitBlock", blockId: "t", offset: 0 }] });
      expect(blocks(editor)).toMatchObject([
        { id: "s" },
        { id: "t", type: "snippet", content: "" },
        { type: "snippet", content: "" },
        { id: "u" },
      ]);
      editor.dispatch({ steps: [{ type: "mergeBlocks", blockId: "u", targetId: "t" }] });
      expect(blocks(editor)[1]).toEqual(block("t", "snippet", "u"));
    });

    it("your empty node takes no text: the step is rejected as in the Rust engine", async () => {
      const before = doc(paragraph("p", "x"), block("r", "rule", null));
      const editor = await open(engine, before);
      expect(
        rejection(editor, [{ type: "insertText", blockId: "r", offset: 0, text: "y", marks: [] }]),
      ).toBe("TRANSFORM_ERROR");
      expect(rejection(editor, [{ type: "splitBlock", blockId: "r", offset: 0 }])).toBe(
        "TRANSFORM_ERROR",
      );
      expect(blocks(editor)).toEqual(before.blocks);
    });

    it("built-in types keep their content kinds", async () => {
      const editor = await open(engine, doc(paragraph("p", "a+b")));
      caret(editor, "p", 1);
      const image = { src: "https://example.com/a.png" };
      for (const type of ["codeBlock", "math", "divider", "image", "paragraph"])
        expect(
          editor
            .chain()
            .insertBlockAfter(type, type === "image" ? image : {})
            .run(),
        ).toBe(true);
      expect(blocks(editor).map(({ type, content }) => [type, content])).toEqual([
        ["paragraph", text("a+b")],
        ["paragraph", []],
        ["image", null],
        ["divider", null],
        ["math", ""],
        ["codeBlock", ""],
      ]);
      expect(editor.chain().setBlockType("math").run()).toBe(true);
      expect(blocks(editor)[0]).toMatchObject({ id: "p", type: "math", content: "a+b" });
      expect(editor.chain().setBlockType("heading", { level: 2 }).run()).toBe(true);
      expect(blocks(editor)[0]).toMatchObject({ type: "heading", content: text("a+b") });
      expect(editor.chain().setBlockType("divider").run()).toBe(true);
      expect(blocks(editor)[0]).toMatchObject({ type: "divider", content: null });
    });

    it("a block without content that becomes text gets empty rich text, as in the Rust engine", async () => {
      const editor = await open(engine, doc(block("d", "divider", null), paragraph("p", "x")));
      editor.dispatch({
        steps: [{ type: "setBlockType", blockId: "d", newType: "paragraph", attrs: {} }],
      });
      editor.dispatch({
        steps: [{ type: "setBlockType", blockId: "p", newType: "snippet", attrs: {} }],
      });
      expect(blocks(editor)).toEqual([paragraph("d", ""), block("p", "snippet", "x")]);
    });

    it("without a schema no type declares a kind: setBlockType keeps the content, a new block gets rich text", async () => {
      const editor = await open(
        engine,
        doc(paragraph("p", "code"), block("r", "divider", null)),
        [],
      );
      editor.dispatch({
        steps: [{ type: "setBlockType", blockId: "p", newType: "codeBlock", attrs: {} }],
      });
      editor.dispatch({
        steps: [{ type: "setBlockType", blockId: "r", newType: "paragraph", attrs: {} }],
      });
      expect(blocks(editor)).toEqual([
        block("p", "codeBlock", text("code")),
        block("r", "paragraph", null),
      ]);
      caret(editor, "p", 0);
      expect(editor.chain().insertBlockAfter("anything").run()).toBe(true);
      expect(blocks(editor)[1]).toMatchObject({ type: "anything", content: [] });
    });
  },
);
