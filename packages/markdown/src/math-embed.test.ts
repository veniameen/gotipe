import { describe, expect, it } from "vitest";
import fixture from "../../../crates/gotipe-export/tests/fixtures/markdown-writer.json";
import { blockToMarkdown, isBlockEmpty, parseMarkdown, serializeMarkdown } from "./index";
import type { Block, Doc } from "./types";

/** Blocks without ids: what a parse means, independent of generated ids. */
function strip(block: Block): unknown {
  return {
    type: block.type,
    attrs: block.attrs,
    content: block.content,
    children: (block.children ?? []).map(strip),
  };
}

const formula = (id: string, tex: string): Block => ({
  id,
  type: "math",
  attrs: { display: "block" },
  content: tex,
  children: [],
});

describe("formulas, embeds, files, quotes and plain code in Markdown", () => {
  // The Rust writer and parser check the same fixture (tests/markdown_writer_parity.rs).
  it.each(fixture.cases)("writes $id with the mapping both writers share", (entry) => {
    const document = entry.document as Doc;
    expect(serializeMarkdown(document).text).toBe(entry.markdown);
    expect(parseMarkdown(entry.markdown).doc.blocks.map(strip)).toEqual(entry.reparsed);
  });

  it.each([
    ["escapes and emphasis", "a \\\\ b\n\\{x\\} = *a* + _b_ + `c`"],
    ["blank lines and block markers", "a\n\n- b\n+ c\n# d\n> e\n1. f\n    g"],
    ["a line of its own $$", "a\n$$\nb"],
    ["$$ and a backtick fence", "x\n  $$\t\n```\n````\ny"],
    ["surrounding whitespace", "\n  lead\ntrail  \n"],
  ])("brings back TeX with %s unchanged", (_name, tex) => {
    const document: Doc = { version: 1, blocks: [formula("m", tex)] };
    const { doc } = parseMarkdown(serializeMarkdown(document).text);
    expect(doc.blocks.map(strip)).toEqual(document.blocks.map(strip));
  });

  it("reads $$ blocks and math fences as formulas, other dollars as text", () => {
    const source = [
      "$$",
      "x^2",
      "$$",
      "",
      "```math",
      "y",
      "```",
      "",
      "```math inline",
      "z",
      "```",
      "",
      "Costs $5 and $$10$$",
      "",
      "Text",
      "$$",
      "",
      "  $$",
      "no closing line",
      "",
    ].join("\n");
    const { doc, snapshot } = parseMarkdown(source);
    expect(doc.blocks.map((block) => [block.type, block.content])).toEqual([
      ["math", "x^2"],
      ["math", "y"],
      ["codeBlock", "z"],
      ["paragraph", [{ text: "Costs $5 and $$10$$", marks: [] }]],
      ["paragraph", [{ text: "Text $$", marks: [] }]],
      ["paragraph", [{ text: "$$ no closing line", marks: [] }]],
    ]);
    expect(serializeMarkdown(doc, snapshot).text).toBe(source);
  });

  it("keeps an embed as a link line that reads back as a paragraph with the link", () => {
    const embed: Block = {
      id: "e",
      type: "embed",
      attrs: { url: "https://youtu.be/x", type: "youtube" },
      content: null,
      children: [],
    };
    const markdown = serializeMarkdown({ version: 1, blocks: [embed] }).text;
    expect(markdown).toBe("[https://youtu.be/x](https://youtu.be/x)\n");
    expect(parseMarkdown(markdown).doc.blocks.map(strip)).toEqual([
      {
        type: "paragraph",
        attrs: {},
        content: [
          {
            text: "https://youtu.be/x",
            marks: [{ type: "link", attrs: { href: "https://youtu.be/x" } }],
          },
        ],
        children: [],
      },
    ]);
  });

  it("skips an empty formula and an embed without an address at any depth", () => {
    const math: Block = formula("m", "");
    const embed: Block = {
      id: "e",
      type: "embed",
      attrs: { url: "" },
      content: null,
      children: [],
    };
    expect(isBlockEmpty(math)).toBe(true);
    expect(isBlockEmpty(embed)).toBe(true);
    expect(isBlockEmpty({ ...math, content: "x" })).toBe(false);
    expect(serializeMarkdown({ version: 1, blocks: [math, embed] }).text).toBe("");
    const item: Block = {
      id: "i",
      type: "listItem",
      attrs: {},
      content: [{ text: "item", marks: [] }],
      children: [
        { ...math, id: "m2" },
        { ...embed, id: "e2" },
      ],
    };
    const list: Block = { id: "l", type: "bulletList", attrs: {}, content: null, children: [item] };
    expect(serializeMarkdown({ version: 1, blocks: [list] }).text).toBe("- item\n");
    expect(blockToMarkdown({ ...math, content: "a\r\nb" })).toBe("$$\na\nb\n$$");
    expect(blockToMarkdown({ ...embed, attrs: { url: "/v.mp4", name: "Clip" } })).toBe(
      "[Clip](/v.mp4)",
    );
  });

  it("writes plain-text code with a bare fence but keeps untouched source", () => {
    const source = "```plain\nkeep me\n```\n\n```plaintext\nand me\n```\n";
    const parsed = parseMarkdown(source);
    expect(parsed.doc.blocks.map((block) => block.attrs.language)).toEqual(["plain", "plaintext"]);
    expect(serializeMarkdown(parsed.doc, parsed.snapshot).text).toBe(source);
    expect(serializeMarkdown(parsed.doc).text).toBe("```\nkeep me\n```\n\n```\nand me\n```\n");
  });
});
