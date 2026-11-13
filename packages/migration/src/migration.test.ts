import type { Block, Document, TextSpan } from "@gotipe/core";
import { describe, expect, it } from "vitest";
import { convertLexicalToGoTipe, convertProseMirrorToGoTipe, convertSlateToGoTipe } from "./index";

function spans(block: Block | undefined): TextSpan[] {
  if (!block || !Array.isArray(block.content)) throw new Error("Expected rich text");
  return block.content;
}
function all(document: Document): Block[] {
  const flatten = (blocks: Block[]): Block[] =>
    blocks.flatMap((block) => [block, ...flatten(block.children)]);
  return flatten(document.blocks);
}
const text = (value: string, format = 0) => ({
  type: "text",
  text: value,
  format,
  detail: 0,
  mode: "normal",
  style: "",
  version: 1,
});

describe("ProseMirror and Tiptap serialized documents", () => {
  it("keeps nested ordered/task lists, raw code, breaks, table spans and marks", () => {
    const source = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 4 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { id: "p1" },
                  content: [
                    { type: "text", text: "Привет 😀", marks: [{ type: "bold" }] },
                    { type: "hardBreak" },
                    { type: "text", text: "next" },
                  ],
                },
                {
                  type: "taskList",
                  content: [
                    {
                      type: "taskItem",
                      attrs: { checked: true },
                      content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: { language: "js" },
          content: [{ type: "text", text: "const x = 1;\n" }],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 2, colwidth: [100, 120] },
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Cell" }] }],
                },
              ],
            },
          ],
        },
      ],
    };
    const before = structuredClone(source);
    const result = convertProseMirrorToGoTipe(source);
    expect(source).toEqual(before);
    expect(result.warnings).toEqual([
      "ProseMirror/Tiptap content[2].content[0].content[0].attrs: tableHeader field colwidth does not fit the GoTipe schema; kept in unmapped",
    ]);
    expect(result.document.blocks[0]?.attrs.start).toBe(4);
    const item = result.document.blocks[0]?.children[0];
    expect(
      spans(item)
        .map((span) => span.text)
        .join(""),
    ).toBe("Привет 😀\nnext");
    expect(item?.attrs).toEqual({});
    expect(item?.children[0]?.children[0]?.attrs.checked).toBe(true);
    expect(result.document.blocks[1]?.content).toBe("const x = 1;\n");
    const header = result.document.blocks[2]?.children[0]?.children[0];
    expect(header?.attrs).toEqual({ colspan: 2 });
    // The flattened paragraph's ID and the column widths stay in the report.
    expect(result.unmapped).toEqual([
      {
        blockId: item?.id,
        path: "content[0].content[0].content[0].attrs",
        sourceType: "paragraph",
        fields: { id: "p1" },
      },
      {
        blockId: header?.id,
        path: "content[2].content[0].content[0].attrs",
        sourceType: "tableHeader",
        fields: { colwidth: [100, 120] },
      },
    ]);
  });

  it("maps snake_case nodes and textStyle without losing link attributes", () => {
    const result = convertProseMirrorToGoTipe({
      type: "doc",
      content: [
        {
          type: "bullet_list",
          content: [
            {
              type: "list_item",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "link",
                      marks: [
                        { type: "strong" },
                        { type: "em" },
                        {
                          type: "link",
                          attrs: {
                            href: "https://example.test",
                            target: "_blank",
                            rel: "noopener",
                          },
                        },
                        {
                          type: "textStyle",
                          attrs: { color: "#123456", fontFamily: "Inter", fontSize: null },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const item = result.document.blocks[0]?.children[0];
    expect(spans(item)[0]?.marks.map((mark) => mark.type)).toEqual([
      "bold",
      "italic",
      "link",
      "textColor",
    ]);
    expect(spans(item)[0]?.marks[2]?.attrs.target).toBe("_blank");
    // Text styles without a GoTipe mark are reported for the block, not dropped or kept raw.
    expect(result.unmapped).toEqual([
      {
        blockId: item?.id,
        path: "content[0].content[0].content[0].content[0].marks[3].attrs",
        sourceType: "textStyle",
        fields: { fontFamily: "Inter" },
      },
    ]);
    expect(result.warnings).toHaveLength(1);
  });

  it("maps basic-schema inline images and prosemirror-markdown list and code attributes", () => {
    const result = convertProseMirrorToGoTipe({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "image", attrs: { src: "a.png", alt: "A", title: null } }],
        },
        {
          type: "ordered_list",
          attrs: { order: 3, tight: true },
          content: [
            {
              type: "list_item",
              content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
            },
          ],
        },
        {
          type: "code_block",
          attrs: { params: "ts {1,3}" },
          content: [{ type: "text", text: "let a" }],
        },
        { type: "image", attrs: { src: null, alt: "Uploading" } },
      ],
    });
    const blocks = result.document.blocks;
    expect(blocks.map((block) => [block.type, block.attrs])).toEqual([
      ["image", { src: "a.png", alt: "A" }],
      ["orderedList", { start: 3 }],
      ["codeBlock", { language: "ts", meta: "{1,3}" }],
      ["markdownRaw", { kind: "json" }],
    ]);
    expect(result.unmapped).toEqual([
      {
        blockId: blocks[1]?.id,
        path: "content[1].attrs",
        sourceType: "ordered_list",
        fields: { tight: true },
      },
    ]);
    expect(result.preserved[0]).toMatchObject({ path: "content[3]", reason: "image requires src" });
  });

  it("preserves unknown inline nodes/marks as intact subtrees and throws in strict mode", () => {
    const paragraph = {
      type: "paragraph",
      content: [
        { type: "text", text: "before" },
        { type: "mention", attrs: { id: "u1", label: "User" } },
      ],
    };
    const source = { type: "doc", content: [paragraph] };
    const warnings: string[] = [];
    const result = convertProseMirrorToGoTipe(source, {
      onWarning: (message) => warnings.push(message),
    });
    expect(result.document.blocks[0]).toMatchObject({
      type: "markdownRaw",
      attrs: { kind: "json" },
    });
    expect(JSON.parse(String(result.document.blocks[0]?.content))).toEqual(paragraph);
    expect(result).toMatchObject({ preservedNodes: 1, skippedNodes: 0 });
    expect(result.preserved).toEqual([
      {
        blockId: result.document.blocks[0]?.id,
        path: "content[0]",
        sourceType: "paragraph",
        reason: "Inline node mention cannot be represented",
      },
    ]);
    expect(warnings).toEqual(result.warnings);
    expect(() => convertProseMirrorToGoTipe(source, { strict: true })).toThrow("mention");
  });
});

describe("Lexical serialized editor state", () => {
  it("maps ordered/check lists, links, every supported text bit and code", () => {
    const result = convertLexicalToGoTipe({
      root: {
        type: "root",
        version: 1,
        children: [
          { type: "heading", tag: "h2", children: [text("Title")] },
          {
            type: "list",
            listType: "number",
            start: 7,
            children: [
              {
                type: "listitem",
                value: 7,
                children: [
                  {
                    type: "link",
                    url: "https://example.test",
                    target: "_blank",
                    children: [text("Link", 1 | 2 | 8)],
                  },
                ],
              },
            ],
          },
          {
            type: "list",
            listType: "check",
            children: [{ type: "listitem", checked: true, children: [text("Done")] }],
          },
          {
            type: "paragraph",
            children: [text("styles", 4 | 16 | 32 | 64 | 128), { type: "linebreak" }, text("next")],
          },
          {
            type: "code",
            language: "js",
            children: [
              { type: "code-highlight", text: "let", format: 0, highlightType: "keyword" },
              text(" x"),
              { type: "linebreak" },
            ],
          },
        ],
      },
    });
    expect(result.warnings).toEqual([]);
    expect(result.document.blocks[0]?.attrs.level).toBe(2);
    expect(result.document.blocks[1]).toMatchObject({ type: "orderedList", attrs: { start: 7 } });
    expect(
      spans(result.document.blocks[1]?.children[0])[0]?.marks.map((mark) => mark.type),
    ).toEqual(["link", "bold", "italic", "underline"]);
    expect(result.document.blocks[2]?.children[0]).toMatchObject({
      type: "todoItem",
      attrs: { checked: true },
    });
    expect(spans(result.document.blocks[3])[0]?.marks.map((mark) => mark.type)).toEqual([
      "strikethrough",
      "code",
      "subscript",
      "superscript",
      "highlight",
    ]);
    expect(result.document.blocks[4]?.content).toBe("let x\n");
  });

  it("retains image/table geometry and custom metadata", () => {
    const result = convertLexicalToGoTipe({
      root: {
        type: "root",
        children: [
          {
            type: "image",
            src: "data:image/png;base64,AA==",
            altText: "Pixel",
            width: 50,
            height: 20,
            children: [],
          },
          {
            type: "table",
            colWidths: [20, 30],
            children: [
              {
                type: "tablerow",
                children: [
                  {
                    type: "tablecell",
                    colSpan: 2,
                    rowSpan: 1,
                    headerState: 1,
                    children: [{ type: "paragraph", children: [text("Cell")] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(result.document.blocks[0]?.attrs).toEqual({
      src: "data:image/png;base64,AA==",
      alt: "Pixel",
      width: 50,
      height: 20,
    });
    expect(result.document.blocks[1]?.attrs).toEqual({ colWidths: [20, 30] });
    expect(result.document.blocks[1]?.children[0]?.children[0]).toMatchObject({
      type: "tableHeader",
      attrs: { colspan: 2, rowspan: 1 },
    });
    expect(result.warnings).toEqual([]);
    expect(result.unmapped).toEqual([
      {
        blockId: result.document.blocks[1]?.children[0]?.children[0]?.id,
        path: "root.children[1].children[0].children[0]",
        sourceType: "tablecell",
        fields: { headerState: 1 },
      },
    ]);
  });

  it("does not silently lose unsupported text transforms or custom nodes", () => {
    const source = {
      root: {
        type: "root",
        children: [
          { type: "paragraph", children: [text("Upper", 512)] },
          { type: "poll", options: ["a", "b"] },
        ],
      },
    };
    const result = convertLexicalToGoTipe(source);
    expect(result.preservedNodes).toBe(2);
    expect(all(result.document).every((block) => block.type === "markdownRaw")).toBe(true);
    expect(() => convertLexicalToGoTipe(source, { strict: true })).toThrow("format");
  });
});

describe("Slate schema migration", () => {
  it("retains leaf marks, inline links and image attributes, and reports alignment", () => {
    const result = convertSlateToGoTipe([
      {
        type: "heading-two",
        align: "center",
        id: "heading",
        children: [{ text: "Title", bold: true }],
      },
      {
        type: "paragraph",
        children: [
          { text: "Before " },
          { type: "link", url: "https://example.test", children: [{ text: "URL", italic: true }] },
          { text: " after", color: "red" },
        ],
      },
      {
        type: "image",
        url: "https://example.test/image.png",
        alt: "photo",
        width: 500,
        children: [{ text: "" }],
      },
      { type: "heading-six", children: [{ text: "Small" }] },
    ]);
    expect(result.warnings).toEqual([
      "Slate [0]: heading-two field align does not fit the GoTipe schema; kept in unmapped",
    ]);
    expect(result.document.blocks[3]?.attrs).toEqual({ level: 6 });
    expect(result.document.blocks[0]).toMatchObject({
      id: "heading",
      type: "heading",
      attrs: { level: 2 },
    });
    expect(result.unmapped).toEqual([
      { blockId: "heading", path: "[0]", sourceType: "heading-two", fields: { align: "center" } },
    ]);
    expect(spans(result.document.blocks[1])[1]?.marks.map((mark) => mark.type)).toEqual([
      "link",
      "italic",
    ]);
    expect(result.document.blocks[2]).toMatchObject({
      type: "image",
      content: null,
      attrs: { src: "https://example.test/image.png", alt: "photo", width: 500 },
    });
  });

  it("copies attrs to an application's own type and fits a GoTipe type's attrs to its schema", () => {
    const result = convertSlateToGoTipe(
      [
        {
          type: "notice",
          settings: { tone: "info" },
          children: [{ text: "Pay attention", emphasis: { color: "yellow" } }],
        },
        {
          type: "aside",
          emoji: "💡",
          settings: { tone: "tip" },
          children: [{ text: "Tip", emphasis: { color: "green", shade: 2 } }],
        },
      ],
      {
        blockTypeMap: { notice: "notice", aside: "callout" },
        markTypeMap: { emphasis: "highlight" },
      },
    );
    // `notice` is not a GoTipe node: its extension declares the attributes, so they are copied.
    expect(result.document.blocks[0]).toMatchObject({
      type: "notice",
      attrs: { settings: { tone: "info" } },
    });
    expect(spans(result.document.blocks[0])[0]?.marks).toEqual([
      { type: "highlight", attrs: { color: "yellow" } },
    ]);
    // `callout` is: it gets the attributes the GoTipe schema declares, the rest is reported.
    expect(result.document.blocks[1]).toMatchObject({ type: "callout", attrs: { emoji: "💡" } });
    expect(spans(result.document.blocks[1])[0]?.marks).toEqual([
      { type: "highlight", attrs: { color: "green" } },
    ]);
    expect(result.unmapped).toEqual([
      {
        blockId: result.document.blocks[1]?.id,
        path: "[1]",
        sourceType: "aside",
        fields: { settings: { tone: "tip" } },
      },
      {
        blockId: result.document.blocks[1]?.id,
        path: "[1].children[0].emphasis",
        sourceType: "emphasis",
        fields: { shade: 2 },
      },
    ]);
  });

  it("preserves unknown schema fragments and rejects them in strict mode", () => {
    const source = [{ type: "paragraph", children: [{ text: "secret", redacted: true }] }];
    const result = convertSlateToGoTipe(source);
    expect(result.preservedNodes).toBe(1);
    expect(JSON.parse(String(result.document.blocks[0]?.content))).toEqual(source[0]);
    expect(() => convertSlateToGoTipe(source, { strict: true })).toThrow("redacted");
  });
});

describe("migration boundaries", () => {
  it("rejects malformed, cyclic and non-JSON objects", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => convertSlateToGoTipe(cyclic)).toThrow("acyclic");
    expect(() => convertSlateToGoTipe([new Date()])).toThrow("plain JSON");
    expect(() => convertProseMirrorToGoTipe({ type: "doc", content: "wrong" })).toThrow("array");
    expect(() =>
      convertLexicalToGoTipe({
        root: {
          type: "root",
          children: [{ type: "paragraph", children: [{ type: "text", text: 5 }] }],
        },
      }),
    ).toThrow("requires text");
  });
  it("replaces duplicate source IDs and validates custom ID factories", () => {
    let next = 0;
    const result = convertSlateToGoTipe(
      [
        { type: "paragraph", id: "same", children: [] },
        { type: "paragraph", id: "same", children: [] },
        { type: "paragraph", id: 7, children: [] },
      ],
      { createId: () => `new${++next}` },
    );
    expect(all(result.document).map((block) => block.id)).toEqual(["same", "new1", "new2"]);
    expect(result.warnings).toEqual([
      "Slate [1]: Duplicate source ID same; generated a replacement",
      "Slate [2]: paragraph field id does not fit the GoTipe schema; kept in unmapped",
    ]);
    // The replaced source IDs stay in the report, so references to them can be remapped.
    expect(result.unmapped).toEqual([
      { blockId: "new1", path: "[1]", sourceType: "paragraph", fields: { id: "same" } },
      { blockId: "new2", path: "[2]", sourceType: "paragraph", fields: { id: 7 } },
    ]);
    expect(() =>
      convertSlateToGoTipe([{ children: [] }, { children: [] }], { createId: () => "same" }),
    ).toThrow("unique");
  });
});
