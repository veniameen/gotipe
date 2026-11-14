import { serializeMarkdown } from "@gotipe/markdown";
import { describe, expect, it } from "vitest";
import { FontFamily, FontSize, Paragraph, TextDirection } from "../src/extensions";
import { parseHtmlDocument } from "../src/html";
import { createEditor } from "../src/js";
import { blocksToHtml } from "../src/serialization/html";
import type { Block } from "../src/types/block";

const marksOf = (block: Block | undefined) =>
  Array.isArray(block?.content) ? block.content.map((span) => [span.text, span.marks]) : [];

describe("font marks and direction in HTML and Markdown", () => {
  it("reads the generic faces, whole-pixel sizes and dir that HTML export writes", () => {
    const doc = parseHtmlDocument(
      [
        '<p dir="RTL"><span style="font-family:system-ui">a</span>',
        '<span style="font-family: ui-serif">b</span>',
        "<span style=\"font-family:'monospace'\">c</span>",
        '<span style="font-family:Arial, sans-serif">d</span>',
        '<span style="font-family:Georgia">e</span>',
        '<span style="font-size:15px">f</span>',
        '<span style="font-size:11pt">g</span>',
        '<span style="font-size:15.5px">h</span>',
        '<span style="font-size:200px">i</span></p>',
        '<h3 dir="auto" style="text-align:right">t</h3><p dir="sideways">x</p>',
        '<ul><li dir="rtl">l</li></ul><ul><li dir="ltr"><input type="checkbox" checked> todo</li></ul>',
      ].join(""),
    );
    expect(doc.blocks[0]!.attrs).toEqual({ dir: "rtl" });
    expect(marksOf(doc.blocks[0])).toEqual([
      ["a", [{ type: "fontFamily", attrs: { family: "system" } }]],
      ["b", [{ type: "fontFamily", attrs: { family: "serif" } }]],
      ["c", [{ type: "fontFamily", attrs: { family: "mono" } }]],
      ["de", []],
      ["f", [{ type: "fontSize", attrs: { size: 15 } }]],
      ["ghi", []],
    ]);
    expect(doc.blocks[1]!.attrs).toEqual({ level: 3, dir: "auto", align: "right" });
    expect(doc.blocks[2]!.attrs).toEqual({});
    expect(doc.blocks[3]!.children[0]).toMatchObject({ type: "listItem", attrs: { dir: "rtl" } });
    expect(doc.blocks[4]!.children[0]).toMatchObject({
      type: "todoItem",
      attrs: { dir: "ltr", checked: true },
    });
  });

  it("round-trips through HTML", () => {
    const blocks: Block[] = [
      {
        id: "p",
        type: "paragraph",
        attrs: { dir: "rtl", align: "center" },
        content: [
          {
            text: "مرحبا",
            marks: [
              { type: "bold", attrs: {} },
              { type: "fontFamily", attrs: { family: "serif" } },
              { type: "fontSize", attrs: { size: 24 } },
            ],
          },
        ],
        children: [],
      },
    ];
    const html = blocksToHtml(blocks);
    expect(html).toBe(
      '<p dir="rtl" style="text-align:center"><span style="font-size:24px"><span style="font-family:serif"><strong>مرحبا</strong></span></span></p>',
    );
    const read = parseHtmlDocument(html).blocks[0]!;
    expect(read.attrs).toEqual({ dir: "rtl", align: "center" });
    // Import lists marks outermost first; the set is the same.
    const sorted = (block: Block) =>
      (block.content as { marks: { type: string }[] }[])[0]!.marks
        .map((mark) => JSON.stringify(mark))
        .sort();
    expect(sorted(read)).toEqual(sorted(blocks[0]!));
  });

  it("reads them only into an editor whose schema declares them", async () => {
    const html = '<p dir="rtl"><span style="font-family:serif;font-size:20px">x</span></p>';
    const plain = await createEditor({ extensions: [Paragraph], content: html });
    expect(plain.getJSON().blocks[0]).toMatchObject({ attrs: { dir: "rtl" } });
    expect(marksOf(plain.getJSON().blocks[0])).toEqual([["x", []]]);
    plain.destroy();
    const styled = await createEditor({
      extensions: [Paragraph, FontFamily, FontSize, TextDirection],
      content: html,
    });
    expect(marksOf(styled.getJSON().blocks[0])).toEqual([
      [
        "x",
        [
          { type: "fontFamily", attrs: { family: "serif" } },
          { type: "fontSize", attrs: { size: 20 } },
        ],
      ],
    ]);
    styled.destroy();
  });

  it("leaves them out of Markdown without failing", () => {
    const markdown = serializeMarkdown({
      version: 1,
      blocks: [
        {
          id: "h",
          type: "heading",
          attrs: { level: 2, dir: "rtl" },
          content: [{ text: "عنوان", marks: [] }],
          children: [],
        },
        {
          id: "p",
          type: "paragraph",
          attrs: { dir: "auto" },
          content: [
            { text: "a ", marks: [{ type: "fontFamily", attrs: { family: "mono" } }] },
            {
              text: "b",
              marks: [
                { type: "bold", attrs: {} },
                { type: "fontSize", attrs: { size: 18 } },
              ],
            },
          ],
          children: [],
        },
      ],
    }).text;
    expect(markdown).toBe("## عنوان\n\na **b**\n");
  });
});
