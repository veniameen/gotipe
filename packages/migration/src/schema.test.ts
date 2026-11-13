import type { Block, GoTipeEditor, TextSpan } from "@gotipe/core";
import { createEditor, defineExtension } from "@gotipe/core/js";
import { DefaultPreset, FullPreset } from "@gotipe/core/presets";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import lexical from "./__fixtures__/lexical.json";
import slate from "./__fixtures__/slate.json";
import tiptap from "./__fixtures__/tiptap.json";
import {
  UnsupportedContent,
  convertLexicalToGoTipe,
  convertProseMirrorToGoTipe,
  convertSlateToGoTipe,
} from "./index";

/** The `markdownRaw` node exactly as `markdownRawNodeSpec` of `@gotipe/markdown` declares it. */
const MarkdownRaw = defineExtension({
  name: "markdownRaw",
  nodes: [
    {
      name: "markdownRaw",
      group: ["block"],
      content: "rawText",
      attrs: { kind: { type: "string", default: "" } },
      topLevel: true,
      marksAllowed: "none",
      leaf: true,
      allowsChildren: false,
    },
  ],
});

let editors: { default: GoTipeEditor; full: GoTipeEditor; fullWithRaw: GoTipeEditor };
beforeAll(async () => {
  editors = {
    default: await createEditor({ extensions: DefaultPreset }),
    full: await createEditor({ extensions: FullPreset }),
    fullWithRaw: await createEditor({ extensions: [...FullPreset, MarkdownRaw] }),
  };
});
afterAll(() => {
  for (const editor of Object.values(editors)) editor.destroy();
});

function ids(): () => string {
  let next = 0;
  return () => `b${++next}`;
}
function all(blocks: Block[]): Block[] {
  return blocks.flatMap((block) => [block, ...all(block.children)]);
}
function text(block: Block | undefined): string {
  if (!block || !Array.isArray(block.content)) throw new Error("Expected rich text");
  return block.content.map((span) => span.text).join("");
}
function spans(block: Block | undefined): TextSpan[] {
  if (!block || !Array.isArray(block.content)) throw new Error("Expected rich text");
  return block.content;
}
function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected an error");
}
const mention = { type: "mention", attrs: { id: "u1", label: "Anya" } };
const paragraph = (...content: object[]) => ({ type: "paragraph", content });

describe("migrated documents fit the stock GoTipe schema", () => {
  it("validates a Tiptap StarterKit document with tables, tasks, an image and links", () => {
    const result = convertProseMirrorToGoTipe(tiptap, { createId: ids() });
    expect(editors.default.validate(result.document)).toBe(true);
    expect(editors.full.validate(result.document)).toBe(true);
    expect(result.preserved).toEqual([]);
    const at = "does not fit the GoTipe schema; kept in unmapped";
    expect(result.warnings).toEqual([
      `ProseMirror/Tiptap content[0].attrs: heading field textAlign ${at}`,
      `ProseMirror/Tiptap content[9].attrs: image field title ${at}`,
      `ProseMirror/Tiptap content[10].content[0].content[0].attrs: tableHeader field colwidth ${at}`,
      `ProseMirror/Tiptap content[10].content[1].content[0].attrs: tableCell field colwidth ${at}`,
    ]);
    expect(
      all(result.document.blocks).flatMap((block) =>
        Object.keys(block.attrs).filter((name) => name.startsWith("migration")),
      ),
    ).toEqual([]);

    const [heading, intro, empty, bullets, tasks, quote, code, plain, divider, image, table] =
      result.document.blocks;
    expect(heading).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(spans(intro).find((span) => span.text === "links")?.marks).toEqual([
      {
        type: "link",
        attrs: {
          href: "https://example.com/docs",
          target: "_blank",
          rel: "noopener noreferrer nofollow",
        },
      },
    ]);
    expect(text(intro)).toContain("code\nКириллица и эмодзи 😀");
    expect(empty).toMatchObject({ type: "paragraph", attrs: {}, content: [] });
    const item = bullets?.children[0];
    expect(text(item)).toBe("Lists");
    expect(item?.children[0]).toMatchObject({ type: "orderedList", attrs: { start: 3 } });
    expect(text(item?.children[0]?.children[0])).toBe("nest");
    expect(tasks?.children[0]).toMatchObject({ type: "todoItem", attrs: { checked: true } });
    expect(tasks?.children[0]?.children[0]?.children[0]).toMatchObject({
      type: "todoItem",
      attrs: { checked: false },
    });
    expect(text(quote)).toBe("Quoted");
    expect(quote?.children.map(text)).toEqual(["twice"]);
    expect(code).toMatchObject({ attrs: { language: "ts" }, content: expect.any(String) });
    expect(plain).toMatchObject({ type: "codeBlock", attrs: {}, content: "plain" });
    expect(divider).toMatchObject({ type: "divider", attrs: {}, content: null });
    expect(image).toMatchObject({
      type: "image",
      attrs: { src: "https://example.com/cover.png", alt: "Cover" },
      content: null,
    });
    expect(table?.children[0]?.children[0]).toMatchObject({
      type: "tableHeader",
      attrs: { colspan: 1, rowspan: 1 },
    });
    // Two paragraphs in one cell become one text with a line break.
    expect(spans(table?.children[1]?.children[1])).toEqual([
      { text: "first\n", marks: [] },
      { text: "second", marks: [{ type: "bold", attrs: {} }] },
    ]);
    expect(table?.children[2]?.children[0]).toMatchObject({
      attrs: { colspan: 2, rowspan: 1 },
      content: [],
    });

    // Nothing is dropped: the source fields are reported for the blocks that hold them.
    expect(result.unmapped).toContainEqual({
      blockId: image?.id,
      path: "content[9].attrs",
      sourceType: "image",
      fields: { title: "Release cover" },
    });
    expect(result.unmapped).toContainEqual({
      blockId: item?.id,
      path: "content[3].content[0].content[0].attrs",
      sourceType: "paragraph",
      fields: { textAlign: "left" },
    });
    expect(result.unmapped.map((entry) => entry.path)).toEqual(
      [...result.unmapped.map((entry) => entry.path)].sort((a, b) =>
        a.localeCompare(b, "en", { numeric: true }),
      ),
    );
  });

  it("validates a Slate document shaped like the Slate examples", () => {
    const result = convertSlateToGoTipe(slate, { createId: ids() });
    expect(editors.default.validate(result.document)).toBe(true);
    expect(editors.full.validate(result.document)).toBe(true);
    expect(result.warnings).toEqual([
      "Slate [1]: paragraph field align does not fit the GoTipe schema; kept in unmapped",
    ]);
    const blocks = result.document.blocks;
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
      "blockquote",
      "bulletList",
      "orderedList",
      "todoList",
      "image",
      "table",
      "heading",
      "paragraph",
    ]);
    expect(blocks[0]?.attrs).toEqual({ level: 1 });
    expect(blocks[1]?.attrs).toEqual({});
    expect(result.unmapped).toEqual([
      { blockId: blocks[1]?.id, path: "[1]", sourceType: "paragraph", fields: { align: "center" } },
    ]);
    expect(spans(blocks[2])[1]).toEqual({
      text: "docs",
      marks: [
        { type: "link", attrs: { href: "https://docs.slatejs.org" } },
        { type: "underline", attrs: {} },
      ],
    });
    // Slate's check-list example keeps its items at the top level; they get one list.
    expect(blocks[6]?.children.map((item) => item.attrs)).toEqual([
      { checked: true },
      { checked: false },
    ]);
    expect(blocks[7]?.attrs).toEqual({
      src: "https://example.com/mountains.jpg",
      alt: "Mountains",
    });
    expect(blocks[8]?.children[1]?.children.map(text)).toEqual(["# of Feet", "2", "4"]);
    expect(spans(blocks[10])[0]?.marks).toEqual([
      { type: "textColor", attrs: { color: "#2f6fdb" } },
    ]);
  });

  it("validates a Lexical playground document", () => {
    const result = convertLexicalToGoTipe(lexical, { createId: ids() });
    expect(editors.default.validate(result.document)).toBe(true);
    expect(editors.full.validate(result.document)).toBe(true);
    const at = "does not fit the GoTipe schema; kept in unmapped";
    expect(result.warnings).toEqual([
      `Lexical root.children[7].children[0]: image field caption ${at}`,
      `Lexical root.children[9].children[0].children[0]: tablecell field width ${at} (4 times)`,
      `Lexical root.children[9].children[1].children[1]: tablecell field backgroundColor ${at}`,
      `Lexical root.children[10]: paragraph field format ${at}`,
      `Lexical root.children[10]: paragraph field indent ${at}`,
      `Lexical root.children[10].children[0]: text field style ${at}`,
    ]);
    const blocks = result.document.blocks;
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "blockquote",
      "bulletList",
      "todoList",
      "orderedList",
      "codeBlock",
      "image",
      "divider",
      "table",
      "paragraph",
    ]);
    expect(blocks.map((block) => block.attrs)).toEqual([
      { level: 1 },
      {},
      {},
      {},
      {},
      { start: 3 },
      { language: "javascript" },
      { src: "https://example.com/flower.jpg", alt: "Yellow flower" },
      {},
      { colWidths: [120, 120] },
      {},
    ]);
    expect(spans(blocks[1])).toEqual([
      { text: "Read the ", marks: [] },
      {
        text: "documentation",
        marks: [{ type: "link", attrs: { href: "https://lexical.dev", rel: "noreferrer" } }],
      },
      { text: " now", marks: [{ type: "bold", attrs: {} }] },
      { text: "\n", marks: [] },
      {
        text: "Привет 😀",
        marks: [
          { type: "italic", attrs: {} },
          { type: "underline", attrs: {} },
          { type: "textColor", attrs: { color: "#d0021b" } },
        ],
      },
    ]);
    expect(blocks[4]?.children.map((item) => item.attrs)).toEqual([
      { checked: true },
      { checked: false },
    ]);
    expect(blocks[6]?.content).toBe("const answer = 42\nanswer");
    const [header, body] = blocks[9]?.children ?? [];
    expect(header?.children.map((cell) => [cell.type, cell.attrs])).toEqual([
      ["tableHeader", { colspan: 1, rowspan: 1 }],
      ["tableHeader", { colspan: 1, rowspan: 1, align: "center" }],
    ]);
    expect(body?.children.map((cell) => [cell.type, text(cell)])).toEqual([
      ["tableHeader", "Size"],
      ["tableCell", "42\nKB"],
    ]);
    expect(result.unmapped[0]).toEqual({
      blockId: null,
      path: "root",
      sourceType: "root",
      fields: { direction: "ltr", format: "", indent: 0, version: 1 },
    });
    expect(result.unmapped).toContainEqual({
      blockId: blocks[10]?.id,
      path: "root.children[10].children[0]",
      sourceType: "text",
      fields: { style: "font-size: 20px" },
    });
  });
});

describe("unsupported content in a migrated document", () => {
  const source = {
    type: "doc",
    content: [
      paragraph({ type: "text", text: "Hi " }, mention),
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph(mention)] }] },
      { type: "blockquote", content: [paragraph(mention)] },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: { colspan: 1, rowspan: 1 },
                content: [paragraph(mention)],
              },
            ],
          },
        ],
      },
    ],
  };

  it("keeps markdownRaw blocks only where the schema allows them", () => {
    const warnings: string[] = [];
    const result = convertProseMirrorToGoTipe(source, {
      createId: ids(),
      onWarning: (message) => warnings.push(message),
    });
    const blocks = result.document.blocks;
    expect(blocks.map((block) => block.type)).toEqual([
      "markdownRaw",
      "bulletList",
      "markdownRaw",
      "markdownRaw",
    ]);
    const item = blocks[1]?.children[0];
    expect(item).toMatchObject({
      type: "listItem",
      content: [],
      children: [{ type: "markdownRaw", attrs: { kind: "json" } }],
    });
    const reason = "Inline node mention cannot be represented";
    expect(result.preserved).toEqual([
      { blockId: blocks[0]?.id, path: "content[0]", sourceType: "paragraph", reason },
      {
        blockId: item?.children[0]?.id,
        path: "content[1].content[0].content[0]",
        sourceType: "paragraph",
        reason,
      },
      {
        blockId: blocks[2]?.id,
        path: "content[2]",
        sourceType: "blockquote",
        reason: `${reason} (at content[2].content[0])`,
      },
      {
        blockId: blocks[3]?.id,
        path: "content[3]",
        sourceType: "table",
        reason: `${reason} (at content[3].content[0].content[0].content[0])`,
      },
    ]);
    expect(result.preservedNodes).toBe(4);
    expect(JSON.parse(String(blocks[3]?.content))).toEqual(source.content[3]);
    expect(result.warnings).toEqual(
      result.preserved.map(
        (entry) =>
          `ProseMirror/Tiptap ${entry.path}: ${entry.reason}; source preserved as markdownRaw`,
      ),
    );
    expect(warnings).toEqual(result.warnings);
    expect(editors.fullWithRaw.validate(result.document)).toBe(true);
    expect(editors.full.validate(result.document)).toBe(false);
  });

  it("undoes what a subtree recorded when an ancestor is preserved instead", () => {
    const result = convertProseMirrorToGoTipe(
      {
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [
              { type: "paragraph", attrs: { id: "inner" }, content: [{ type: "text", text: "a" }] },
              {
                type: "bulletList",
                content: [{ type: "listItem", content: [paragraph(mention)] }],
              },
            ],
          },
          { type: "paragraph", attrs: { id: "inner" }, content: [{ type: "text", text: "kept" }] },
        ],
      },
      { createId: ids() },
    );
    // The ID of the paragraph inside the preserved quote is free again: no duplicate warning.
    expect(result.document.blocks.map((block) => block.type)).toEqual(["markdownRaw", "paragraph"]);
    expect(result.document.blocks[1]?.id).toBe("inner");
    expect(result.warnings).toEqual([
      "ProseMirror/Tiptap content[0]: bulletList cannot be inside blockquote (at content[0].content[1]); source preserved as markdownRaw",
    ]);
    expect(result.preserved).toHaveLength(1);
    expect(result.unmapped).toEqual([]);
    expect(editors.fullWithRaw.validate(result.document)).toBe(true);
  });

  it("throws the exported UnsupportedContent with the source path in strict mode", () => {
    const error = thrown(() => convertProseMirrorToGoTipe(source, { strict: true }));
    expect(error).toBeInstanceOf(UnsupportedContent);
    expect(error).toMatchObject({
      name: "UnsupportedContent",
      path: "content[0]",
      reason: "Inline node mention cannot be represented",
      message: "ProseMirror/Tiptap content[0]: Inline node mention cannot be represented",
    });
    const nested = thrown(() =>
      convertLexicalToGoTipe(
        {
          root: {
            type: "root",
            children: [
              {
                type: "list",
                listType: "bullet",
                children: [{ type: "listitem", children: [{ type: "poll", options: [] }] }],
              },
            ],
          },
        },
        { strict: true },
      ),
    );
    expect(nested).toMatchObject({ path: "root.children[0].children[0].children[0]" });
  });
});

describe("lists and headings in table cells", () => {
  const p = (text: string, marks?: object[]) => ({
    type: "paragraph",
    content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
  });
  const cell = (type: string, ...content: object[]) => ({
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content,
  });
  const table = (...rows: object[][]) => ({
    type: "doc",
    content: [
      { type: "table", content: rows.map((cells) => ({ type: "tableRow", content: cells })) },
    ],
  });
  const tiptap = table(
    [
      cell("tableHeader", {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Plan" }],
      }),
      cell("tableHeader", p("Status")),
    ],
    [
      cell("tableCell", p("Steps"), {
        type: "bulletList",
        content: [
          { type: "listItem", content: [p("one", [{ type: "bold" }])] },
          {
            type: "listItem",
            content: [
              p("two"),
              {
                type: "orderedList",
                attrs: { start: 3 },
                content: [{ type: "listItem", content: [p("deep")] }],
              },
            ],
          },
        ],
      }),
      cell("tableCell", {
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: true }, content: [p("done")] },
          { type: "taskItem", attrs: { checked: false }, content: [p("todo")] },
        ],
      }),
    ],
  );

  it("writes Tiptap lists and headings in cells as lines and keeps the table editable", () => {
    const result = convertProseMirrorToGoTipe(tiptap, { createId: ids() });
    expect(editors.default.validate(result.document)).toBe(true);
    expect(editors.full.validate(result.document)).toBe(true);
    expect(result.preserved).toEqual([]);
    const [header, body] = result.document.blocks[0]?.children ?? [];
    expect(header?.children.map((item) => [item.type, item.attrs, text(item)])).toEqual([
      ["tableHeader", { colspan: 1, rowspan: 1 }, "Plan"],
      ["tableHeader", { colspan: 1, rowspan: 1 }, "Status"],
    ]);
    const steps = body?.children[0];
    expect(steps?.children).toEqual([]);
    expect(spans(steps)).toEqual([
      { text: "Steps\n• ", marks: [] },
      { text: "one", marks: [{ type: "bold", attrs: {} }] },
      { text: "\n• two\n  3. deep", marks: [] },
    ]);
    expect(text(body?.children[1])).toBe("☑ done\n☐ todo");
    const flattened = "became lines of its text; kept in unmapped";
    expect(result.warnings).toEqual([
      `ProseMirror/Tiptap content[0].content[0].content[0].content[0]: heading in tableHeader ${flattened}`,
      `ProseMirror/Tiptap content[0].content[1].content[0].content[1]: bulletList in tableCell ${flattened}`,
      `ProseMirror/Tiptap content[0].content[1].content[1].content[0]: taskList in tableCell ${flattened}`,
    ]);
    // The block each list or heading would have been stays in the report, tied to its cell.
    const list = result.unmapped.find((entry) => entry.sourceType === "bulletList");
    expect(list).toMatchObject({
      blockId: steps?.id,
      path: "content[0].content[1].content[0].content[1]",
      fields: {
        block: {
          type: "bulletList",
          children: [
            { type: "listItem", content: [{ text: "one", marks: [{ type: "bold", attrs: {} }] }] },
            { type: "listItem", children: [{ type: "orderedList", attrs: { start: 3 } }] },
          ],
        },
      },
    });
    expect(result.unmapped.find((entry) => entry.sourceType === "heading")?.fields).toMatchObject({
      block: { type: "heading", attrs: { level: 3 } },
    });
    expect(result.unmapped.every((entry) => entry.blockId !== null)).toBe(true);
    const blockIds = new Set(all(result.document.blocks).map((block) => block.id));
    expect(result.unmapped.every((entry) => blockIds.has(String(entry.blockId)))).toBe(true);
    expect(() => convertProseMirrorToGoTipe(tiptap, { strict: true })).not.toThrow();
  });

  it("writes Lexical lists and headings in cells as lines, nested lists indented", () => {
    const leaf = (value: string, format = 0) => ({
      type: "text",
      text: value,
      format,
      detail: 0,
      mode: "normal",
      style: "",
      version: 1,
    });
    const lexicalCell = (headerState: number, ...children: object[]) => ({
      type: "tablecell",
      headerState,
      colSpan: 1,
      rowSpan: 1,
      children,
      direction: "ltr",
      format: "",
      indent: 0,
      version: 1,
    });
    const source = {
      root: {
        type: "root",
        children: [
          {
            type: "table",
            children: [
              {
                type: "tablerow",
                children: [
                  lexicalCell(1, { type: "heading", tag: "h2", children: [leaf("Plan")] }),
                ],
              },
              {
                type: "tablerow",
                children: [
                  lexicalCell(0, {
                    type: "list",
                    listType: "bullet",
                    start: 1,
                    tag: "ul",
                    children: [
                      { type: "listitem", value: 1, children: [leaf("a", 1)] },
                      {
                        type: "listitem",
                        value: 2,
                        children: [
                          {
                            type: "list",
                            listType: "number",
                            start: 1,
                            tag: "ol",
                            children: [{ type: "listitem", value: 1, children: [leaf("b")] }],
                          },
                        ],
                      },
                      { type: "listitem", value: 2, children: [leaf("c")] },
                    ],
                  }),
                ],
              },
            ],
          },
        ],
      },
    };
    const result = convertLexicalToGoTipe(source, { createId: ids() });
    expect(editors.default.validate(result.document)).toBe(true);
    const [header, body] = result.document.blocks[0]?.children ?? [];
    expect(text(header?.children[0])).toBe("Plan");
    // Lexical's item that only holds the nested list gets no line of its own.
    expect(spans(body?.children[0])).toEqual([
      { text: "• ", marks: [] },
      { text: "a", marks: [{ type: "bold", attrs: {} }] },
      { text: "\n  1. b\n• c", marks: [] },
    ]);
    const flattened = "became lines of its text; kept in unmapped";
    expect(result.warnings).toEqual([
      `Lexical root.children[0].children[0].children[0].children[0]: heading in tablecell ${flattened}`,
      `Lexical root.children[0].children[1].children[0].children[0]: list in tablecell ${flattened}`,
    ]);
    expect(() => convertLexicalToGoTipe(source, { strict: true })).not.toThrow();
  });

  it("keeps the whole table as JSON when a cell holds a block without a text form", () => {
    const source = table([
      cell("tableCell", {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [p("x"), { type: "codeBlock", content: [{ type: "text", text: "code" }] }],
          },
        ],
      }),
    ]);
    const result = convertProseMirrorToGoTipe(source, { createId: ids() });
    expect(result.document.blocks.map((block) => block.type)).toEqual(["markdownRaw"]);
    expect(result.preserved[0]).toMatchObject({
      path: "content[0]",
      sourceType: "table",
      reason: "codeBlock cannot become text of tableCell (at content[0].content[0].content[0])",
    });
    expect(result.unmapped).toEqual([]);
    expect(thrown(() => convertProseMirrorToGoTipe(source, { strict: true }))).toBeInstanceOf(
      UnsupportedContent,
    );
  });
});
