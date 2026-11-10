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
    expect(result.warnings).toEqual([]);
    expect(result.document.blocks[0]?.attrs.start).toBe(4);
    const item = result.document.blocks[0]?.children[0];
    expect(
      spans(item)
        .map((span) => span.text)
        .join(""),
    ).toBe("Привет 😀\nnext");
    expect(item?.attrs.migrationFirstParagraph).toMatchObject({ id: "p1" });
    expect(item?.children[0]?.children[0]?.attrs.checked).toBe(true);
    expect(result.document.blocks[1]?.content).toBe("const x = 1;\n");
    expect(result.document.blocks[2]?.children[0]?.children[0]?.attrs).toMatchObject({
      colspan: 2,
      colwidth: [100, 120],
    });
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
                        { type: "textStyle", attrs: { color: "#123456" } },
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
    expect(
      spans(result.document.blocks[0]?.children[0])[0]?.marks.map((mark) => mark.type),
    ).toEqual(["bold", "italic", "link", "textColor"]);
    expect(spans(result.document.blocks[0]?.children[0])[0]?.marks[2]?.attrs.target).toBe("_blank");
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
    expect(result.document.blocks[0]?.type).toBe("markdownRaw");
    expect(JSON.parse(String(result.document.blocks[0]?.content))).toEqual(paragraph);
    expect(result).toMatchObject({ preservedNodes: 1, skippedNodes: 0 });
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
    expect(result.document.blocks[0]?.attrs).toMatchObject({
      altText: "Pixel",
      width: 50,
      height: 20,
    });
    expect(result.document.blocks[1]?.children[0]?.children[0]).toMatchObject({
      type: "tableHeader",
      attrs: { colspan: 2, rowspan: 1 },
    });
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
  it("retains leaf marks, inline links, alignment and image attributes", () => {
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
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.document.blocks[0]).toMatchObject({
      id: "heading",
      type: "heading",
      attrs: { level: 2, align: "center" },
    });
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

  it("accepts explicit custom block/mark maps while retaining structured attrs", () => {
    const result = convertSlateToGoTipe(
      [
        {
          type: "notice",
          settings: { tone: "info" },
          children: [{ text: "Pay attention", emphasis: { color: "yellow" } }],
        },
      ],
      {
        blockTypeMap: { notice: "callout" },
        markTypeMap: { emphasis: "highlight" },
      },
    );
    expect(result.document.blocks[0]).toMatchObject({
      type: "callout",
      attrs: { settings: { tone: "info" } },
    });
    expect(spans(result.document.blocks[0])[0]?.marks).toEqual([
      { type: "highlight", attrs: { color: "yellow" } },
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
    const result = convertSlateToGoTipe([
      { type: "paragraph", id: "same", children: [] },
      { type: "paragraph", id: "same", children: [] },
    ]);
    expect(new Set(all(result.document).map((block) => block.id)).size).toBe(2);
    expect(result.warnings[0]).toContain("Duplicate");
    expect(() =>
      convertSlateToGoTipe([{ children: [] }, { children: [] }], { createId: () => "same" }),
    ).toThrow("unique");
  });
});
