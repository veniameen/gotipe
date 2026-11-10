import { describe, expect, it } from "vitest";
import { createEditor } from "../src/js";
import { editTable } from "../src/tables";

async function setup() {
  const editor = await createEditor({
    extensions: [],
    content: {
      version: 1,
      blocks: [
        {
          id: "table",
          type: "table",
          attrs: {},
          content: null,
          children: [0, 1].map((row) => ({
            id: `row${row}`,
            type: "tableRow",
            attrs: {},
            content: null,
            children: [0, 1].map((col) => ({
              id: `c${row}${col}`,
              type: row === 0 ? "tableHeader" : "tableCell",
              attrs: {},
              content: [{ text: `${row}:${col}😀`, marks: [{ type: "bold", attrs: {} }] }],
              children: [],
            })),
          })),
        },
      ],
    },
  });
  return editor;
}
describe("table transactions", () => {
  it("inserts/deletes columns across all rows atomically and preserves cells and widths with Undo", async () => {
    const editor = await setup();
    const original = editor.getJSON();
    editTable(editor, "table", { type: "insertColumn", index: 1 });
    expect(editor.getJSON().blocks[0]!.children.map((row) => row.children.length)).toEqual([3, 3]);
    expect(editor.getJSON().blocks[0]!.children[0]!.children[1]!.type).toBe("tableHeader");
    editTable(editor, "table", { type: "resizeColumn", index: 1, width: 245 });
    expect(editor.getJSON().blocks[0]!.attrs.colWidths).toEqual([160, 245, 160]);
    editTable(editor, "table", { type: "deleteColumn", index: 1 });
    expect(editor.getJSON().blocks[0]!.children).toEqual(original.blocks[0]!.children);
    editor.undo();
    expect(editor.getJSON().blocks[0]!.attrs.colWidths).toEqual([160, 245, 160]);
    editor.undo();
    editor.undo();
    expect(editor.getJSON().blocks).toEqual(original.blocks);
    editor.destroy();
  });
  it("validates before mutation and does not change read-only tables", async () => {
    const editor = await setup();
    const original = editor.getJSON();
    expect(() => editTable(editor, "table", { type: "deleteRow", index: 4 })).toThrow();
    expect(editor.getJSON()).toEqual(original);
    expect(editor.undo()).toBe(false);
    editor.setEditable(false);
    expect(editTable(editor, "table", { type: "insertRow", index: 2 })).toBe(false);
    expect(editor.getJSON()).toEqual(original);
    editor.destroy();
  });
  it("inserts a real row and restores deleted cell content and marks", async () => {
    const editor = await setup();
    const original = editor.getJSON();
    editTable(editor, "table", { type: "insertRow", index: 2 });
    expect(editor.getJSON().blocks[0]!.children).toHaveLength(3);
    editTable(editor, "table", { type: "deleteRow", index: 0 });
    editor.undo();
    editor.undo();
    expect(editor.getJSON().blocks).toEqual(original.blocks);
    editor.destroy();
  });
});
