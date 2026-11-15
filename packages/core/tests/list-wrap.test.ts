import { afterEach, describe, expect, it } from "vitest";
import { FullPreset } from "../src/presets";
import type { Document } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { defineExtension } from "../src/types/extension";
import { ENGINES, type Engine, block, createOn, doc, paragraph, text } from "./engines";

/** Node types of your own: `note` holds rich text, `snippet` raw text, `rule` nothing. */
const Custom = defineExtension({
  name: "custom-list-wrap",
  nodes: [
    {
      name: "note",
      group: ["block"],
      content: "richText",
      attrs: {},
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
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

async function open(engine: Engine, content: Document) {
  const editor = await createOn(engine, { extensions: [FullPreset, Custom], content });
  editors.push(editor);
  return editor;
}

const caret = (editor: GoTipeEditor, blockId: string, offset = 0) =>
  editor.setSelection({ anchor: { blockId, offset }, head: { blockId, offset } });
const blocks = (editor: GoTipeEditor) => (editor.getJSON() as Document).blocks;
const bold = { type: "bold", attrs: {} };

describe.each(ENGINES)("%s engine: list commands wrap any block with text (D-143)", (engine) => {
  it("a formula becomes the list's item and keeps its source as text", async () => {
    const editor = await open(engine, doc(block("m", "math", "a^2", { display: "block" })));
    caret(editor, "m", 1);
    expect(editor.chain().toggleBulletList().run()).toBe(true);
    expect(blocks(editor)).toMatchObject([
      {
        type: "bulletList",
        children: [{ id: "m", type: "listItem", content: text("a^2"), children: [] }],
      },
    ]);
    expect(editor.undo()).toBe(true);
    expect(blocks(editor)).toMatchObject([{ id: "m", type: "math", content: "a^2" }]);
  });

  it("a toggle keeps its title, and its children go into the item", async () => {
    const editor = await open(
      engine,
      doc(
        block("t", "toggle", text("Title"), { open: true }, [paragraph("c", "inside")]),
        block("u", "toggle", text("Alone"), { open: false }),
      ),
    );
    caret(editor, "t", 2);
    expect(editor.chain().toggleBulletList().run()).toBe(true);
    caret(editor, "u", 0);
    expect(editor.chain().toggleOrderedList().run()).toBe(true);
    expect(blocks(editor)).toMatchObject([
      {
        type: "bulletList",
        children: [
          {
            id: "t",
            type: "listItem",
            content: text("Title"),
            children: [{ id: "c", type: "paragraph", content: text("inside") }],
          },
        ],
      },
      { type: "orderedList", children: [{ id: "u", type: "listItem", content: text("Alone") }] },
    ]);
  });

  it("nodes of your own with rich or raw text become items; marks stay", async () => {
    const editor = await open(
      engine,
      doc(
        block("n", "note", [
          { text: "Bold", marks: [bold] },
          { text: " note", marks: [] },
        ]),
        block("s", "snippet", "x = 1"),
      ),
    );
    caret(editor, "n", 1);
    expect(editor.chain().toggleTodoList().run()).toBe(true);
    caret(editor, "s", 0);
    expect(editor.chain().toggleBulletList().run()).toBe(true);
    expect(blocks(editor)).toMatchObject([
      {
        type: "todoList",
        children: [
          {
            id: "n",
            type: "todoItem",
            attrs: { checked: false },
            content: [
              { text: "Bold", marks: [bold] },
              { text: " note", marks: [] },
            ],
          },
        ],
      },
      { type: "bulletList", children: [{ id: "s", type: "listItem", content: text("x = 1") }] },
    ]);
  });

  it("a block without text stays as it is", async () => {
    const start = doc(block("d", "divider", null), block("r", "rule", null), paragraph("p", "x"));
    const editor = await open(engine, start);
    editor.chain().selectBlock("d").toggleBulletList().run();
    editor.chain().selectBlock("r").toggleTodoList().run();
    expect(blocks(editor)).toEqual(start.blocks);
  });

  it("a paragraph is wrapped and unwrapped as before", async () => {
    const editor = await open(engine, doc(paragraph("p", "Text")));
    caret(editor, "p", 1);
    expect(editor.chain().toggleBulletList().run()).toBe(true);
    expect(blocks(editor)).toMatchObject([
      { type: "bulletList", children: [{ id: "p", type: "listItem", content: text("Text") }] },
    ]);
    expect(editor.chain().toggleBulletList().run()).toBe(true);
    expect(blocks(editor)).toMatchObject([{ id: "p", type: "paragraph", content: text("Text") }]);
  });
});
