// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { ChainableCommands } from "../src/chain";
import { createEditorWithLoader } from "../src/editor";
import { Heading } from "../src/extensions/heading";
import { DefaultPreset, FullPreset } from "../src/presets";
import type { Block, Document, Mark } from "../src/types/block";
import type { Extension } from "../src/types/extension";

beforeAll(() => {
  wasm.initSync({
    module: readFileSync(new URL("../../wasm/pkg/gotipe_wasm_bg.wasm", import.meta.url)),
  });
});

const ENGINES = ["js", "wasm"] as const;
type Engine = (typeof ENGINES)[number];
const bold: Mark = { type: "bold", attrs: {} };
const text = (id: string, value: string, type = "paragraph", marks: Mark[] = []): Block => ({
  id,
  type,
  attrs: {},
  content: value ? [{ text: value, marks }] : [],
  children: [],
});
const container = (id: string, type: string, children: Block[], attrs = {}): Block => ({
  id,
  type,
  attrs,
  content: null,
  children,
});

/** Paragraph, nested list, table, divider, image and code: text and structure blocks mixed. */
const mixed = (): Block[] => [
  text("p", "Абзац 😀"),
  container("list", "bulletList", [
    {
      ...text("item", "пункт"),
      type: "listItem",
      children: [container("nested", "bulletList", [text("deep", "вложенный", "listItem")])],
    },
  ]),
  container("table", "table", [
    container("row", "tableRow", [text("c1", "ячейка", "tableCell"), text("c2", "", "tableCell")]),
  ]),
  container("hr", "divider", []),
  { ...container("img", "image", []), attrs: { src: "https://example.com/a.png" } },
  { ...text("code", ""), type: "codeBlock", attrs: { language: "ts" }, content: "const a = 1;" },
  text("last", "конец"),
];

async function create(engine: Engine, blocks: Block[], extensions: Extension[] = FullPreset) {
  return createEditorWithLoader(
    { engine, extensions, content: { version: 1, blocks } },
    engine === "wasm" ? async () => wasm : null,
  );
}

const flatten = (blocks: Block[]): Block[] =>
  blocks.flatMap((block) => [block, ...flatten(block.children)]);
const marksOf = (document: Document, id: string): Mark[][] => {
  const content = flatten(document.blocks).find((block) => block.id === id)?.content;
  return Array.isArray(content) ? content.map((span) => span.marks) : [];
};

/** Runs a scenario on both engines and requires the same documents from them. */
async function parity(
  blocks: Block[],
  scenario: (editor: Awaited<ReturnType<typeof create>>) => void,
  extensions: Extension[] = FullPreset,
): Promise<Document> {
  const results: Document[] = [];
  for (const engine of ENGINES) {
    const editor = await create(engine, blocks, extensions);
    scenario(editor);
    results.push(editor.getJSON());
    editor.destroy();
  }
  const [js, native] = results.map(({ blocks: list }) => list);
  expect(native).toEqual(js);
  return results[0]!;
}

describe.each(ENGINES)("%s mark commands across blocks without text", (engine) => {
  it("formats every text block a select-all covers and skips the rest (D-01)", async () => {
    const editor = await create(engine, mixed());
    const before = editor.getJSON();
    expect(editor.chain().selectAll().toggleBold().run()).toBe(true);
    const after = editor.getJSON();
    for (const id of ["p", "item", "deep", "c1", "last"])
      expect(marksOf(after, id), id).toEqual([[bold]]);
    expect(marksOf(after, "c2")).toEqual([]);
    expect(after.blocks.find((block) => block.id === "code")!.content).toBe("const a = 1;");
    const strip = (blocks: Block[]): unknown =>
      blocks.map(({ content, ...rest }) => ({
        ...rest,
        content: Array.isArray(content) ? content.map((span) => span.text) : content,
        children: strip(rest.children),
      }));
    expect(strip(after.blocks)).toEqual(strip(before.blocks));

    // Every selected character is bold, so the same command removes it everywhere.
    editor.chain().selectAll().toggleBold().run();
    expect(editor.getJSON().blocks).toEqual(before.blocks);
    editor.undo();
    expect(editor.getJSON().blocks).toEqual(after.blocks);
    editor.undo();
    expect(editor.getJSON().blocks).toEqual(before.blocks);
    expect(editor.undo()).toBe(false);
    editor.destroy();
  });

  it("adds a mark when only part of the selection has it", async () => {
    const blocks = mixed();
    blocks[0] = text("p", "Абзац", "paragraph", [bold]);
    const editor = await create(engine, blocks);
    editor.chain().selectAll().toggleBold().run();
    for (const id of ["p", "item", "deep", "c1", "last"])
      expect(marksOf(editor.getJSON(), id), id).toEqual([[bold]]);
    editor.destroy();
  });

  it("formats the cells of a selected table and the rows of a selected list", async () => {
    const editor = await create(engine, mixed());
    expect(editor.chain().selectBlock("table").toggleItalic().run()).toBe(true);
    expect(marksOf(editor.getJSON(), "c1")).toEqual([[{ type: "italic", attrs: {} }]]);
    expect(marksOf(editor.getJSON(), "p")).toEqual([[]]);
    editor.chain().selectBlock("list").toggleCode().run();
    expect(marksOf(editor.getJSON(), "deep")).toEqual([[{ type: "code", attrs: {} }]]);
    editor.destroy();
  });

  it("keeps a cross-block selection from a list item into a table cell valid", async () => {
    const editor = await create(engine, mixed());
    editor.setSelection({
      anchor: { blockId: "c1", offset: 3 },
      head: { blockId: "item", offset: 2 },
    });
    editor.chain().toggleStrikethrough().run();
    const strike = { type: "strikethrough", attrs: {} };
    const doc = editor.getJSON();
    expect(marksOf(doc, "item")).toEqual([[], [strike]]);
    expect(marksOf(doc, "deep")).toEqual([[strike]]);
    expect(marksOf(doc, "c1")).toEqual([[strike], []]);
    expect(marksOf(doc, "p")).toEqual([[]]);
    editor.destroy();
  });
});

describe("mark attributes are replaced, not kept (D-02)", () => {
  const link = (href: string) => ({ type: "link", attrs: { href } });

  it("changes the address of an existing link as one undo step", async () => {
    const blocks = [
      {
        ...text("p", ""),
        content: [
          { text: "старый ", marks: [link("https://old.test")] },
          { text: "текст", marks: [] },
        ],
      },
    ];
    const doc = await parity(blocks, (editor) => {
      editor.setSelection({
        anchor: { blockId: "p", offset: 0 },
        head: { blockId: "p", offset: 12 },
      });
      editor.chain().setLink("https://new.test").run();
      const content = editor.getJSON().blocks[0]!.content;
      expect(content).toEqual([
        {
          text: "старый текст",
          marks: [
            {
              type: "link",
              attrs: { href: "https://new.test", target: "_blank", rel: "noopener noreferrer" },
            },
          ],
        },
      ]);
      editor.undo();
      expect(editor.getJSON().blocks).toEqual(blocks);
      editor.redo();
    });
    expect(doc.blocks[0]!.content).toHaveLength(1);
  });

  it("recolours text that already has a colour", async () => {
    const color = (value: string) => ({ type: "textColor", attrs: { color: value } });
    const blocks = [
      {
        ...text("p", ""),
        content: [
          { text: "Цв", marks: [color("#c4382f"), bold] },
          { text: "ет😀", marks: [bold] },
        ],
      },
    ];
    await parity(blocks, (editor) => {
      editor.setSelection({
        anchor: { blockId: "p", offset: 0 },
        head: { blockId: "p", offset: 6 },
      });
      editor.chain().setMark("textColor", { color: "#2c62d4" }).run();
      expect(editor.getJSON().blocks[0]!.content).toEqual([
        { text: "Цв", marks: [color("#2c62d4"), bold] },
        { text: "ет😀", marks: [bold, color("#2c62d4")] },
      ]);
      editor.undo();
      expect(editor.getJSON().blocks).toEqual(blocks);
    });
  });

  it("replaces attributes in an addMark step the same way in both engines", async () => {
    const blocks = [
      {
        ...text("p", ""),
        content: [{ text: "highlight", marks: [{ type: "highlight", attrs: { color: "red" } }] }],
      },
    ];
    const doc = await parity(blocks, (editor) =>
      editor.dispatch({
        steps: [
          {
            type: "addMark",
            blockId: "p",
            from: 4,
            to: 9,
            mark: { type: "highlight", attrs: { color: "#e6ecfa" } },
          },
        ],
      }),
    );
    expect(doc.blocks[0]!.content).toEqual([
      { text: "high", marks: [{ type: "highlight", attrs: { color: "red" } }] },
      { text: "light", marks: [{ type: "highlight", attrs: { color: "#e6ecfa" } }] },
    ]);
  });

  it("replicates a recolouring to a peer and undoes it as one step", async () => {
    const color = (value: string) => ({ type: "textColor", attrs: { color: value } });
    const original = [{ text: "Цвет😀", marks: [color("#c4382f")] }];
    const blocks = [{ ...text("p", ""), content: original }];
    const [a, b] = [await create("wasm", blocks), await create("wasm", blocks)];
    a.enableCollaboration("recolour-a");
    b.enableCollaboration("recolour-b");
    a.setSelection({ anchor: { blockId: "p", offset: 0 }, head: { blockId: "p", offset: 6 } });
    a.chain().setMark("textColor", { color: "#2c62d4" }).run();
    b.receiveCollaborationUpdate(a.getCollaborationUpdate());
    expect(b.getJSON().blocks[0]!.content).toEqual([{ text: "Цвет😀", marks: [color("#2c62d4")] }]);
    expect(a.undo()).toBe(true);
    expect(a.getJSON().blocks[0]!.content).toEqual(original);
    b.receiveCollaborationUpdate(a.getCollaborationUpdate());
    expect(b.getJSON().blocks[0]!.content).toEqual(original);
    a.destroy();
    b.destroy();
  });

  it("merges spans whose attributes differ only in key order, as Rust does", async () => {
    const link = (attrs: Record<string, string>) => ({ type: "link", attrs });
    const blocks = [
      {
        ...text("p", ""),
        content: [
          { text: "a", marks: [link({ href: "h", target: "t" })] },
          { text: "b", marks: [link({ target: "t", href: "h" })] },
        ],
      },
    ];
    const doc = await parity(blocks, (editor) =>
      editor.dispatch({
        steps: [{ type: "insertText", blockId: "p", offset: 2, text: "c", marks: [] }],
      }),
    );
    expect(doc.blocks[0]!.content).toEqual([
      { text: "ab", marks: [link({ href: "h", target: "t" })] },
      { text: "c", marks: [] },
    ]);
  });
});

describe("exclusive groups and attribute defaults (D-09)", () => {
  const sup: Mark = { type: "superscript", attrs: {} };
  const sub: Mark = { type: "subscript", attrs: {} };

  it("superscript replaces subscript over the range", async () => {
    const blocks = [{ ...text("p", ""), content: [{ text: "H2O", marks: [sub] }] }];
    await parity(blocks, (editor) => {
      editor.setSelection({
        anchor: { blockId: "p", offset: 1 },
        head: { blockId: "p", offset: 2 },
      });
      editor.chain().toggleSuperscript().run();
      expect(editor.getJSON().blocks[0]!.content).toEqual([
        { text: "H", marks: [sub] },
        { text: "2", marks: [sup] },
        { text: "O", marks: [sub] },
      ]);
    });
  });

  it("text inserted with marks of one group keeps the last of them", async () => {
    await parity([text("p", "x")], (editor) =>
      editor.dispatch({
        steps: [
          { type: "insertText", blockId: "p", offset: 1, text: "2", marks: [sup, bold, sub] },
        ],
      }),
    ).then((doc) =>
      expect(doc.blocks[0]!.content).toEqual([
        { text: "x", marks: [] },
        { text: "2", marks: [bold, sub] },
      ]),
    );
  });

  it.each(ENGINES)("stored marks at a caret keep one mark of a group in %s", async (engine) => {
    const editor = await create(engine, [text("p", "x")]);
    editor.setSelection({ anchor: { blockId: "p", offset: 1 }, head: { blockId: "p", offset: 1 } });
    editor.chain().toggleSuperscript().run();
    editor.chain().toggleSubscript().run();
    expect(editor.getViewState().toolbar.activeMarks).toEqual(["subscript"]);
    editor.destroy();
  });

  it.each(ENGINES)("commands write declared defaults in %s", async (engine) => {
    const editor = await create(engine, [text("p", "жёлтый")]);
    editor.chain().insertBlockAfter("callout").run();
    expect(editor.getJSON().blocks[1]!.attrs).toEqual({ type: "info", emoji: "" });
    editor.setSelection({ anchor: { blockId: "p", offset: 0 }, head: { blockId: "p", offset: 0 } });
    editor.chain().setBlockType("heading").run();
    expect(editor.getJSON().blocks[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    editor.destroy();
  });

  it.each(ENGINES)("toggleHighlight() stays colourless, a plain <mark>, in %s", async (engine) => {
    const editor = await create(engine, [text("p", "жёлтый")]);
    editor.setSelection({ anchor: { blockId: "p", offset: 0 }, head: { blockId: "p", offset: 6 } });
    editor.chain().toggleHighlight().run();
    expect(editor.getJSON().blocks[0]!.content).toEqual([
      { text: "жёлтый", marks: [{ type: "highlight", attrs: {} }] },
    ]);
    expect(editor.getMarkdown()).toBe("<mark>жёлтый</mark>\n");
    expect(editor.getHTML()).toBe("<p><mark>жёлтый</mark></p>");
    editor.chain().toggleHighlight("#e6ecfa").run();
    expect(editor.getJSON().blocks[0]!.content).toEqual([{ text: "жёлтый", marks: [] }]);
    editor.chain().setMark("highlight", { color: "#e6ecfa" }).run();
    expect(editor.getHTML()).toMatch(/<mark style="background(?:-color)?:\s*#e6ecfa">/);
    editor.destroy();
  });

  it.each(ENGINES)("a new code block is plain text with a bare fence in %s", async (engine) => {
    const editor = await create(engine, [text("p", "const a = 1;")]);
    editor.setSelection({ anchor: { blockId: "p", offset: 0 }, head: { blockId: "p", offset: 0 } });
    editor.chain().setBlockType("codeBlock").run();
    editor.chain().insertBlockAfter("codeBlock").run();
    expect(editor.getJSON().blocks.map((block) => block.attrs)).toEqual([
      { language: "" },
      { language: "" },
    ]);
    const markdown = editor.getMarkdown();
    expect(markdown.startsWith("```\nconst a = 1;\n```\n")).toBe(true);
    expect(markdown).not.toMatch(/```\S/);
    const html = editor.getHTML();
    expect(html.startsWith("<pre><code>const a = 1;</code></pre>")).toBe(true);
    expect(html).not.toContain("language-");
    editor.destroy();
  });

  it("keeps accepting an allowsChild function as the chain's second argument", async () => {
    const quote: Block = { ...text("quote", "", "blockquote"), children: [text("inner", "x")] };
    const editor = await create("js", [quote]);
    editor.setSelection({
      anchor: { blockId: "inner", offset: 0 },
      head: { blockId: "inner", offset: 0 },
    });
    expect(new ChainableCommands(editor, () => false).insertBlockAfter("paragraph").run()).toBe(
      true,
    );
    expect(editor.getJSON().blocks.map((block) => block.type)).toEqual(["blockquote", "paragraph"]);
    editor.chain().insertBlockAfter("paragraph").run();
    expect(editor.getJSON().blocks[0]!.children).toHaveLength(2);
    editor.destroy();
  });
});

describe.each(ENGINES)("%s heading levels (D-09)", (engine) => {
  it("creates only the configured levels and keeps loaded ones", async () => {
    const editor = await create(
      engine,
      [text("a", "a"), { ...text("h", "h4", "heading"), attrs: { level: 4 } }],
      DefaultPreset,
    );
    editor.setSelection({ anchor: { blockId: "a", offset: 0 }, head: { blockId: "a", offset: 0 } });
    expect(editor.chain().setBlockType("heading", { level: 4 }).run()).toBe(false);
    expect(editor.chain().insertBlockAfter("heading", { level: 5 }).run()).toBe(false);
    expect(editor.getJSON().blocks.map((block) => block.type)).toEqual(["paragraph", "heading"]);
    expect(editor.chain().setBlockType("heading", { level: 3 }).run()).toBe(true);
    expect(editor.getJSON().blocks[0]!.attrs).toEqual({ level: 3 });
    editor.setSelection({ anchor: { blockId: "h", offset: 0 }, head: { blockId: "h", offset: 2 } });
    editor.chain().toggleBold().run();
    expect(editor.getJSON().blocks[1]).toMatchObject({
      attrs: { level: 4 },
      content: [{ text: "h4", marks: [bold] }],
    });
    editor.destroy();
  });
});

describe("Heading.configure({ levels }) (D-09)", () => {
  it("builds input rules, shortcuts and slash entries from the levels", () => {
    const heading = DefaultPreset.find((extension) => extension.name === "heading")!;
    expect(heading.options).toEqual({ levels: [1, 2, 3] });
    const rule = heading.inputRules![0]!;
    expect(["# ", "## ", "### "].every((typed) => rule.pattern.test(typed))).toBe(true);
    expect(["#### ", "####### ", "#x ", "# a"].some((typed) => rule.pattern.test(typed))).toBe(
      false,
    );
    expect(heading.keybindings!.map((binding) => binding.key)).toEqual([
      "mod-alt-1",
      "mod-alt-2",
      "mod-alt-3",
    ]);
    expect(heading.slashCommands!.map((command) => command.name)).toEqual([
      "Heading 1",
      "Heading 2",
      "Heading 3",
    ]);
    expect(FullPreset.filter((extension) => extension.name === "heading")).toHaveLength(1);
    const full = FullPreset.find((extension) => extension.name === "heading")!;
    expect(full.keybindings!.map((binding) => binding.key)).toHaveLength(6);
    const custom = Heading.configure({ levels: [3, 9, 2, 3] });
    expect(custom.options).toEqual({ levels: [2, 3] });
    expect(custom.nodes![0]!.attrs.level).toMatchObject({ default: 2, values: [2, 3] });
    expect(custom.configure({ levels: [] }).inputRules).toEqual([]);
  });
});
