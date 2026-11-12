import { describe, expect, it } from "vitest";

import { BulletList, ListItem, TodoList } from "../src/extensions/bullet-list";
import { Paragraph } from "../src/extensions/paragraph";
import { createEditor } from "../src/js";
import type { Block } from "../src/types/block";

const item = (type: "listItem" | "todoItem", id: string, text: string): Block => ({
  id,
  type,
  attrs: type === "todoItem" ? { checked: false } : {},
  content: [{ text, marks: [] }],
  children: [],
});

async function editorWith(list: Block) {
  return createEditor({
    extensions: [Paragraph, BulletList, ListItem, TodoList],
    content: { version: 1, blocks: [list] },
    engine: "js",
  });
}

/** The shape of a list tree: type and id, nested by indentation. */
function shape(blocks: Block[], depth = 0): string[] {
  return blocks.flatMap((b) => [
    `${"  ".repeat(depth)}${b.type}:${b.id}`,
    ...shape(b.children, depth + 1),
  ]);
}

describe("list indentation (Tab / Shift+Tab)", () => {
  it("nests a list item under the previous one and lifts it back", async () => {
    const editor = await editorWith({
      id: "list",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [item("listItem", "a", "First"), item("listItem", "b", "Second")],
    });
    editor.setSelection({ anchor: { blockId: "b", offset: 0 }, head: { blockId: "b", offset: 0 } });
    editor.chain().indent().run();
    const nested = editor.getJSON().blocks[0]!.children[0]!.children[0]!;
    expect(nested.type).toBe("bulletList");
    expect(nested.children.map((c) => c.id)).toEqual(["b"]);
    editor.setSelection({ anchor: { blockId: "b", offset: 0 }, head: { blockId: "b", offset: 0 } });
    editor.chain().outdent().run();
    expect(shape(editor.getJSON().blocks)).toEqual([
      "bulletList:list",
      "  listItem:a",
      "  listItem:b",
    ]);
    editor.destroy();
  });

  it("gives a task a sub-list of tasks, and lifts it back", async () => {
    const editor = await editorWith({
      id: "tasks",
      type: "todoList",
      attrs: {},
      content: null,
      children: [
        item("todoItem", "a", "Ship the journal"),
        item("todoItem", "b", "Write the migration"),
      ],
    });
    editor.setSelection({ anchor: { blockId: "b", offset: 0 }, head: { blockId: "b", offset: 0 } });
    editor.chain().indent().run();
    const blocks = editor.getJSON().blocks;
    const nested = blocks[0]!.children[0]!.children[0]!;
    expect(nested.type).toBe("todoList");
    expect(nested.children.map((c) => [c.type, c.id])).toEqual([["todoItem", "b"]]);
    editor.setSelection({ anchor: { blockId: "b", offset: 0 }, head: { blockId: "b", offset: 0 } });
    editor.chain().outdent().run();
    expect(shape(editor.getJSON().blocks)).toEqual([
      "todoList:tasks",
      "  todoItem:a",
      "  todoItem:b",
    ]);
    editor.destroy();
  });

  it("leaves the first item where it is", async () => {
    const editor = await editorWith({
      id: "tasks",
      type: "todoList",
      attrs: {},
      content: null,
      children: [item("todoItem", "a", "Only")],
    });
    editor.setSelection({ anchor: { blockId: "a", offset: 0 }, head: { blockId: "a", offset: 0 } });
    editor.chain().indent().run();
    expect(shape(editor.getJSON().blocks)).toEqual(["todoList:tasks", "  todoItem:a"]);
    editor.destroy();
  });
});
