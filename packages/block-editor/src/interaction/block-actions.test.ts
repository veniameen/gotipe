import type { Block, GoTipeEditor, Mark } from "@gotipe/core";
import { Mention } from "@gotipe/core/extensions";
import { createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { afterEach, describe, expect, it } from "vitest";
import { moveDraggedBlock } from "../components/block-interaction";
import { deleteMenuBlock, duplicateMenuBlock, resetMenuBlock } from "./block-actions";

const bold: Mark = { type: "bold", attrs: {} };
const link: Mark = { type: "link", attrs: { href: "https://example.com", target: "_blank" } };
const mention: Mark = {
  type: "mention",
  attrs: { id: "u1", label: "Ann", kind: "user", key: "m" },
};
const block = (
  id: string,
  type: string,
  content: Block["content"],
  children: Block[] = [],
  attrs: Block["attrs"] = {},
): Block => ({ id, type, attrs, content, children });
const text = (value: string, ...marks: Mark[]) => [{ text: value, marks }];
const row = (id: string, value: string, children: Block[] = []) =>
  block(id, "listItem", text(value), children);
const task = (id: string, value: string, checked: boolean) =>
  block(id, "todoItem", text(value), [], { checked });
const list = (id: string, rows: Block[], type = "bulletList") => block(id, type, null, rows);

/** A bullet list with a nested list, a task list and a list in the first of two columns. */
const DOCUMENT: Block[] = [
  list("L", [row("a", "one"), row("b", "two", [list("N", [row("c", "three")])]), row("d", "four")]),
  list("T", [task("t1", "task", true), task("t2", "next", false)], "todoList"),
  block("C", "columns", null, [
    block("K1", "column", null, [list("CL", [row("x", "left one"), row("y", "left two")])]),
    block("K2", "column", null, [block("r", "paragraph", text("right"))]),
  ]),
  block("P", "paragraph", text("after")),
];

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
async function editorWith(blocks: Block[] = DOCUMENT) {
  const editor = await createEditor({
    extensions: [FullPreset, Mention],
    content: { version: 1, blocks: structuredClone(blocks) },
  });
  editors.push(editor);
  return editor;
}

/** The document as `type#id text` lines; nesting by indent. */
function outline(blocks: Block[], depth = 0): string[] {
  return blocks.flatMap((item) => [
    `${"  ".repeat(depth)}${item.type}#${item.id}${
      Array.isArray(item.content) ? ` ${item.content.map((span) => span.text).join("")}` : ""
    }`,
    ...outline(item.children, depth + 1),
  ]);
}
const shape = (editor: GoTipeEditor) => outline(editor.getJSON().blocks as Block[]);
const find = (blocks: Block[], id: string): Block | undefined =>
  blocks.length === 0
    ? undefined
    : (blocks.find((item) => item.id === id) ??
      find(
        blocks.flatMap((item) => item.children),
        id,
      ));

/** The action changes the document, and one Undo brings back exactly the document before. */
function oneStep(editor: GoTipeEditor, action: () => boolean) {
  const before = editor.getJSON();
  expect(action()).toBe(true);
  expect(editor.getJSON()).not.toEqual(before);
  expect(editor.undo()).toBe(true);
  expect(editor.getJSON()).toEqual(before);
  expect(editor.redo()).toBe(true);
}

describe("Delete in the block menu", () => {
  it("removes a list row with its nested rows and keeps the rest of the list", async () => {
    const editor = await editorWith();
    oneStep(editor, () => deleteMenuBlock(editor, "b"));
    expect(shape(editor).slice(0, 3)).toEqual([
      "bulletList#L",
      "  listItem#a one",
      "  listItem#d four",
    ]);
  });

  it("takes an emptied nested list with its only row; the parent row stays", async () => {
    const editor = await editorWith();
    oneStep(editor, () => deleteMenuBlock(editor, "c"));
    expect(shape(editor).slice(0, 4)).toEqual([
      "bulletList#L",
      "  listItem#a one",
      "  listItem#b two",
      "  listItem#d four",
    ]);
  });

  it("takes a top-level list with its only row", async () => {
    const editor = await editorWith([list("L", [row("a", "one")]), DOCUMENT[3]!]);
    oneStep(editor, () => deleteMenuBlock(editor, "a"));
    expect(shape(editor)).toEqual(["paragraph#P after"]);
  });

  it("removes one task, and one row of a list inside a column", async () => {
    const editor = await editorWith();
    oneStep(editor, () => deleteMenuBlock(editor, "t1"));
    oneStep(editor, () => deleteMenuBlock(editor, "x"));
    const after = shape(editor);
    expect(after).toContain("todoList#T");
    expect(after).not.toContain("  todoItem#t1 task");
    expect(after).toContain("  todoItem#t2 next");
    expect(after).toContain("      listItem#y left two");
    expect(after).not.toContain("      listItem#x left one");
    expect(after).toContain("    paragraph#r right");
  });
});

describe("a column is never left without blocks", () => {
  const lonely = () => [
    block("C", "columns", null, [
      block("K1", "column", null, [list("CL", [row("x", "only")])]),
      block("K2", "column", null, [block("r", "paragraph", text("right"))]),
    ]),
    block("P", "paragraph", text("after")),
  ];
  const firstColumn = (editor: GoTipeEditor) => find(editor.getJSON().blocks as Block[], "K1")!;

  it("gets an empty paragraph when Delete takes its only list; the caret follows from it", async () => {
    const editor = await editorWith(lonely());
    editor.setSelection({ anchor: { blockId: "x", offset: 2 }, head: { blockId: "x", offset: 2 } });
    oneStep(editor, () => deleteMenuBlock(editor, "x"));
    const [paragraph, ...rest] = firstColumn(editor).children;
    expect(rest).toEqual([]);
    expect(paragraph).toMatchObject({ type: "paragraph", content: [], children: [] });
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: paragraph!.id, offset: 0 });
    // A caret elsewhere stays where it is.
    editor.undo();
    editor.setSelection({ anchor: { blockId: "P", offset: 3 }, head: { blockId: "P", offset: 3 } });
    expect(deleteMenuBlock(editor, "x")).toBe(true);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "P", offset: 3 });
  });

  it("gets an empty paragraph when its only row is dragged out, in one undo step", async () => {
    const editor = await editorWith(lonely());
    oneStep(editor, () => moveDraggedBlock(editor, "x", { parentId: null, index: 2 }));
    expect(firstColumn(editor).children).toMatchObject([
      { type: "paragraph", content: [], children: [] },
    ]);
    const top = editor.getJSON().blocks as Block[];
    expect(top.map((item) => item.type)).toEqual(["columns", "paragraph", "bulletList"]);
    expect(top[2]!.children.map((item) => item.id)).toEqual(["x"]);
  });
});

describe("Duplicate in the block menu", () => {
  it("copies a row with its nested rows into the same list, with new IDs", async () => {
    const editor = await editorWith();
    oneStep(editor, () => duplicateMenuBlock(editor, "b"));
    const rows = (editor.getJSON().blocks[0] as Block).children;
    expect(rows.map((item) => (item.content as { text: string }[])[0]?.text)).toEqual([
      "one",
      "two",
      "two",
      "four",
    ]);
    const copy = rows[2]!;
    expect(copy.id).not.toBe("b");
    expect(outline([copy]).map((line) => line.replace(/#[^ ]+/, ""))).toEqual([
      "listItem two",
      "  bulletList",
      "    listItem three",
    ]);
    const ids = outline(editor.getJSON().blocks as Block[]).map(
      (line) => line.match(/#(\S+)/)?.[1],
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps a task's mark and copies a row inside a column in place", async () => {
    const editor = await editorWith();
    oneStep(editor, () => duplicateMenuBlock(editor, "t1"));
    const tasks = find(editor.getJSON().blocks as Block[], "T")!.children;
    expect(tasks.map((item) => item.attrs.checked)).toEqual([true, true, false]);
    oneStep(editor, () => duplicateMenuBlock(editor, "y"));
    const column = find(editor.getJSON().blocks as Block[], "CL")!.children;
    expect(column.map((item) => (item.content as { text: string }[])[0]?.text)).toEqual([
      "left one",
      "left two",
      "left two",
    ]);
  });
});

describe("Reset formatting in the block menu", () => {
  const rich = [
    { text: "Bold", marks: [bold] },
    { text: " and ", marks: [] },
    { text: "link", marks: [link] },
    { text: " for ", marks: [] },
    { text: "@Ann", marks: [mention] },
  ];

  it("turns a heading into a paragraph without marks; a mention stays", async () => {
    const editor = await editorWith([block("H", "heading", rich, [], { level: 2 })]);
    oneStep(editor, () => resetMenuBlock(editor, "H"));
    const paragraph = editor.getJSON().blocks[0]!;
    expect(paragraph).toMatchObject({ id: "H", type: "paragraph" });
    expect(paragraph.content).toEqual([
      { text: "Bold and link for ", marks: [] },
      { text: "@Ann", marks: [mention] },
    ]);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "H", offset: 22 });
  });

  it("lifts a list row out as plain text and leaves the other rows in the list", async () => {
    const editor = await editorWith([
      list("L", [row("a", "one"), block("b", "listItem", rich), row("d", "four")]),
    ]);
    oneStep(editor, () => resetMenuBlock(editor, "b", 4));
    expect(shape(editor).map((line) => line.replace(/#[^ ]+/, ""))).toEqual([
      "bulletList",
      "  listItem one",
      "paragraph Bold and link for @Ann",
      "bulletList",
      "  listItem four",
    ]);
    const marks = (find(editor.getJSON().blocks as Block[], "b")!.content as { marks: Mark[] }[])
      .flatMap((span) => span.marks)
      .map((mark) => mark.type);
    expect(marks).toEqual(["mention"]);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "b", offset: 4 });
  });

  it("keeps the type of a block with children, a toggle, and removes the marks of its title", async () => {
    const editor = await editorWith([
      block(
        "G",
        "toggle",
        [{ text: "Title", marks: [bold] }],
        [block("g1", "paragraph", text("in"))],
      ),
    ]);
    oneStep(editor, () => resetMenuBlock(editor, "G"));
    expect(editor.getJSON().blocks[0]).toMatchObject({
      id: "G",
      type: "toggle",
      content: [{ text: "Title", marks: [] }],
      children: [{ id: "g1", type: "paragraph" }],
    });
    // Nothing left to reset: no change, no undo step.
    const before = editor.getJSON();
    expect(resetMenuBlock(editor, "G")).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });

  it("leaves a block without text of its own as it is: an image, a divider, a table", async () => {
    const cell = (id: string, value: string) => block(id, "tableHeader", text(value));
    const editor = await editorWith([
      block("I", "image", null, [], { src: "https://example.com/a.png", alt: "a" }),
      block("D", "divider", null),
      block("T", "table", null, [
        block("tr", "tableRow", null, [cell("c1", "a"), cell("c2", "b")]),
      ]),
    ]);
    const before = editor.getJSON();
    for (const id of ["I", "D", "T"]) expect(resetMenuBlock(editor, id)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(editor.undo()).toBe(false);
  });

  it("resets a task, and a numbered row inside a column (columns take no task lists)", async () => {
    const editor = await editorWith([
      list("T", [block("t1", "todoItem", text("Due", bold), [], { checked: true })], "todoList"),
      block("C", "columns", null, [
        block("K1", "column", null, [
          list("O", [block("o1", "listItem", text("First", bold, link))], "orderedList"),
        ]),
        block("K2", "column", null, [block("r", "paragraph", text("right"))]),
      ]),
    ]);
    oneStep(editor, () => resetMenuBlock(editor, "t1"));
    oneStep(editor, () => resetMenuBlock(editor, "o1"));
    expect(shape(editor)).toEqual([
      "paragraph#t1 Due",
      "columns#C",
      "  column#K1",
      "    paragraph#o1 First",
      "  column#K2",
      "    paragraph#r right",
    ]);
    const blocks = editor.getJSON().blocks as Block[];
    expect(find(blocks, "t1")!.content).toEqual(text("Due"));
    expect(find(blocks, "t1")!.attrs).toEqual({});
    expect(find(blocks, "o1")!.content).toEqual(text("First"));
  });
});
