// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { createEditorWithLoader } from "../src/editor";
import { Paragraph } from "../src/extensions/paragraph";
import { FullPreset } from "../src/presets";
import type { Block, Document } from "../src/types/block";
import { type Extension, defineExtension } from "../src/types/extension";

beforeAll(() => {
  wasm.initSync({
    module: readFileSync(new URL("../../wasm/pkg/gotipe_wasm_bg.wasm", import.meta.url)),
  });
});
const block = (id: string, value: string, type = "paragraph"): Block => ({
  id,
  type,
  attrs: {},
  content: [{ text: value, marks: [] }],
  children: [],
});

describe.each(["js", "wasm"] as const)("%s commands preserve document structure", (engine) => {
  const create = (blocks: Block[], extensions: Extension[] = FullPreset) =>
    createEditorWithLoader(
      { engine, extensions, content: { version: 1, blocks } },
      engine === "wasm" ? async () => wasm : null,
    );

  it("duplicates an entire nested block with fresh IDs, marks and raw content", async () => {
    const list = {
      ...block("list", "", "bulletList"),
      content: null,
      children: [
        {
          ...block("item", "row", "listItem"),
          children: [
            {
              ...block("nested", "", "bulletList"),
              content: null,
              children: [block("leaf", "nested row", "listItem")],
            },
          ],
        },
      ],
    };
    const editor = await create([list]);
    editor.chain().duplicateBlock("list").run();
    const doc = editor.getJSON() as Document;
    const normalize = (item: Block): unknown => ({
      ...item,
      id: "",
      children: item.children.map(normalize),
    });
    expect(normalize(doc.blocks[1]!)).toEqual(normalize(list));
    const ids = (item: Block): string[] => [item.id, ...item.children.flatMap(ids)];
    expect(new Set(doc.blocks.flatMap(ids)).size).toBe(8);
    editor.undo();
    expect((editor.getJSON() as Document).blocks).toHaveLength(1);
    editor.destroy();
  });

  it("formats a reverse multi-paragraph selection while retaining its direction", async () => {
    const editor = await create([block("a", "abcd"), block("b", "efgh")]);
    const selection = { anchor: { blockId: "b", offset: 2 }, head: { blockId: "a", offset: 1 } };
    editor.setSelection(selection);
    editor.chain().toggleBold().run();
    expect(editor.getHTML().trim()).toBe(
      "<p>a<strong>bcd</strong></p>\n<p><strong>ef</strong>gh</p>",
    );
    expect(editor.getViewState().selection).toEqual({ type: "text", ...selection });
    editor.chain().toggleBold().run();
    expect(editor.getHTML().trim()).toBe("<p>abcd</p>\n<p>efgh</p>");
    editor.destroy();
  });

  it("selects all and replaces through a fluent chain, preserving insertion order", async () => {
    const editor = await create([block("a", "old"), block("b", "text")]);
    expect(editor.chain().selectAll().run()).toBe(true);
    expect(editor.getViewState().selection).toMatchObject({
      anchor: { blockId: "a", offset: 0 },
      head: { blockId: "b", offset: 4 },
    });
    expect(editor.getViewState().toolbar.canUndo).toBe(false);
    editor.chain().insertText("A").insertText("B").run();
    expect(editor.getText()).toBe("AB");
    editor.undo();
    expect(editor.getText()).toBe("old\ntext");
    editor.chain().selectBlock("b").run();
    expect(editor.getViewState().selection).toMatchObject({
      type: "block",
      anchor: { blockId: "b", offset: 0 },
    });
    editor.destroy();
  });

  it("stages a captured cross-block selection without changing the live caret before commit", async () => {
    const editor = await create([block("a", "abcd"), block("b", "efgh")]);
    const live = { anchor: { blockId: "b", offset: 4 }, head: { blockId: "b", offset: 4 } };
    editor.setSelection(live);
    const chain = editor
      .chain()
      .setSelection({
        type: "range",
        anchor: { blockId: "b", offset: 2 },
        head: { blockId: "a", offset: 1 },
      })
      .insertText("😀");
    expect(editor.getViewState().selection).toEqual({ type: "text", ...live });
    expect(chain.run()).toBe(true);
    expect(editor.getText()).toBe("a😀gh");
    editor.undo();
    expect(editor.getText()).toBe("abcd\nefgh");
    expect(editor.getViewState().selection).toEqual({ type: "text", ...live });
    editor.destroy();
  });

  it("inserts and reorders a nested sibling without moving it to the root", async () => {
    const container = {
      ...block("quote", "", "blockquote"),
      children: [block("nested", "inside"), block("next", "next")],
    };
    const customParagraph = defineExtension({
      ...Paragraph,
      nodes: Paragraph.nodes!.map((node) => ({
        ...node,
        attrs: { ...node.attrs, config: { type: "object" as const } },
      })),
    });
    const editor = await create(
      [container, block("tail", "tail")],
      [...FullPreset, customParagraph],
    );
    editor
      .chain()
      .setSelection({ type: "cursor", blockId: "nested", offset: 0 })
      .insertBlockAfter("paragraph", { config: { nested: true } })
      .run();
    const nested = editor.getJSON().blocks[0]!.children;
    expect(nested).toHaveLength(3);
    expect(nested[1]!.attrs.config).toEqual({ nested: true });
    editor.chain().moveBlockDown("nested").run();
    expect(editor.getJSON().blocks[0]!.children[1]!.id).toBe("nested");
    expect(editor.getJSON().blocks.map((item) => item.id)).toEqual(["quote", "tail"]);
    editor.destroy();
  });

  it("navigates table cells without requiring or changing another editor's DOM", async () => {
    const table: Block = {
      id: "table",
      type: "table",
      attrs: {},
      content: null,
      children: [
        {
          id: "row",
          type: "tableRow",
          attrs: {},
          content: null,
          children: [block("a", "first", "tableCell"), block("b", "second", "tableCell")],
        },
      ],
    };
    const editor = await create([table]);
    const other = await create([table]);
    editor.setSelection({ anchor: { blockId: "a", offset: 1 }, head: { blockId: "a", offset: 1 } });
    expect(editor.chain().goToNextCell().run()).toBe(true);
    expect(editor.getViewState().selection).toMatchObject({
      anchor: { blockId: "b", offset: 0 },
      head: { blockId: "b", offset: 6 },
    });
    expect(other.getViewState().selection.anchor.blockId).not.toBe("b");
    editor.destroy();
    other.destroy();
  });

  it("lifts a middle list item in place while preserving IDs and nested descendants", async () => {
    const list: Block = {
      id: "list",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [
        block("a", "first", "listItem"),
        block("b", "middle", "listItem"),
        block("c", "last", "listItem"),
      ],
    };
    const editor = await create([list]);
    editor.setSelection({ anchor: { blockId: "b", offset: 2 }, head: { blockId: "b", offset: 2 } });
    editor.chain().setBlockType("paragraph").run();
    const doc = editor.getJSON() as Document;
    expect(doc.blocks.map((item) => item.type)).toEqual(["bulletList", "paragraph", "bulletList"]);
    expect(doc.blocks[1]!.id).toBe("b");
    expect(doc.blocks[2]!.children[0]!.id).toBe("c");
    expect(editor.getText()).toBe("first\nmiddle\nlast");
    editor.undo();
    expect((editor.getJSON() as Document).blocks).toEqual([list]);
    editor.destroy();
  });
  it("inserts media and compound blocks after a list instead of inside its row array", async () => {
    for (const type of ["divider", "image", "table", "columns", "toggle"]) {
      const list: Block = {
        id: "list",
        type: "bulletList",
        attrs: {},
        content: null,
        children: [block("row", "Keep 😀", "listItem")],
      };
      const editor = await create([block("before", "before"), list, block("after", "after")]);
      const before = editor.getJSON();
      editor.setSelection({
        anchor: { blockId: "row", offset: 3 },
        head: { blockId: "row", offset: 3 },
      });
      const chain = editor.chain();
      if (type === "table") chain.insertTable({ rows: 2, cols: 2 });
      else if (type === "columns") chain.insertColumns(2);
      else if (type === "toggle") chain.insertToggle();
      else chain.insertBlockAfter(type, type === "image" ? { src: "" } : undefined);
      chain.run();
      const after = editor.getJSON();
      expect(after.blocks.map((item) => item.type)).toEqual([
        "paragraph",
        "bulletList",
        type,
        "paragraph",
      ]);
      expect(after.blocks[1]).toEqual(before.blocks[1]);
      editor.undo();
      expect(editor.getJSON().blocks).toEqual(before.blocks);
      editor.destroy();
    }
  });

  it("keeps explicit row insertion in the list and before insertion outside structural parents", async () => {
    const editor = await create([
      {
        id: "list",
        type: "todoList",
        attrs: {},
        content: null,
        children: [block("row", "Text", "todoItem")],
      },
    ]);
    editor.setSelection({
      anchor: { blockId: "row", offset: 0 },
      head: { blockId: "row", offset: 0 },
    });
    editor.chain().insertBlockAfter("todoItem", { checked: false }).run();
    expect(editor.getJSON().blocks[0]!.children).toHaveLength(2);
    editor.chain().insertBlockBefore("image", { src: "" }).run();
    expect(editor.getJSON().blocks.map((item) => item.type)).toEqual(["image", "todoList"]);
    editor.destroy();
  });

  it("rejects unbounded compound dimensions without a partial document or history", async () => {
    const editor = await create([block("body", "text")]);
    const before = editor.getJSON();
    expect(() => editor.chain().insertTable({ rows: 0, cols: 1 }).run()).toThrow();
    expect(() => editor.chain().insertTable({ rows: 1000000, cols: 1000000 }).run()).toThrow();
    expect(() => editor.chain().insertColumns(Number.POSITIVE_INFINITY).run()).toThrow();
    expect(editor.getJSON()).toEqual(before);
    expect(editor.undo()).toBe(false);
    editor.destroy();
  });
  it("uses custom parent childTypes when placing ordinary and compound blocks", async () => {
    const container = defineExtension({
      name: "restrictedContainer",
      nodes: [{
        name: "restrictedContainer", group: ["block"], content: "empty",
        attrs: {}, topLevel: true, marksAllowed: "none", leaf: false,
        allowsChildren: true, childTypes: ["paragraph"],
      }],
    });
    const editor = await create([
      { ...block("container", "", "restrictedContainer"), content: null, children: [block("child", "inside")] },
      block("tail", "after"),
    ], [...FullPreset, container]);
    const select = () => editor.setSelection({ anchor: { blockId: "child", offset: 0 }, head: { blockId: "child", offset: 0 } });
    select();
    editor.chain().insertBlockAfter("paragraph").run();
    expect(editor.getJSON().blocks[0]!.children).toHaveLength(2);
    editor.undo();
    select();
    editor.chain().insertBlockAfter("divider").run();
    expect(editor.getJSON().blocks.map((item) => item.type)).toEqual(["restrictedContainer", "divider", "paragraph"]);
    editor.undo();
    select();
    editor.chain().insertTable({ rows: 1, cols: 1 }).run();
    expect(editor.getJSON().blocks.map((item) => item.type)).toEqual(["restrictedContainer", "table", "paragraph"]);
    editor.undo();
    select();
    editor.chain().insertBlockBefore("divider").run();
    expect(editor.getJSON().blocks.map((item) => item.type)).toEqual(["divider", "restrictedContainer", "paragraph"]);
    editor.destroy();
  });

});
