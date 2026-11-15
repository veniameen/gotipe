import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./index";
import type { Block } from "./types";

const text = (block: Block): string =>
  typeof block.content === "string"
    ? block.content
    : (block.content ?? []).map((span) => span.text).join("");

describe("owned Markdown grammar", () => {
  it("keeps nested links outside the outer bracket text", () => {
    const block = parseMarkdown("[outer [inner](/inner)](/outer)").doc.blocks[0]!;
    expect(block.content).toEqual([
      { text: "[outer ", marks: [] },
      { text: "inner", marks: [{ type: "link", attrs: { href: "/inner" } }] },
      { text: "](/outer)", marks: [] },
    ]);
  });

  it("recognizes reference definitions with multiline labels and titles without losing source", () => {
    const source = '[Build\n  status]: /status "Build\nstatus"\n\n[current][Build status]\n';
    const parsed = parseMarkdown(source);
    expect(parsed.doc.blocks.map((block) => block.type)).toEqual(["markdownRaw", "paragraph"]);
    expect(parsed.doc.blocks[1]!.content).toEqual([
      { text: "[current][Build status]", marks: [{ type: "mdRaw" }] },
    ]);
    expect(serializeMarkdown(parsed.doc, parsed.snapshot).text).toBe(source);
  });

  it("does not recognize a definition without whitespace before its title", () => {
    const blocks = parseMarkdown("[x]: <path>(caption)\n\n[x]").doc.blocks;
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "paragraph"]);
    expect(blocks[1]!.content).toEqual([{ text: "[x]", marks: [] }]);
  });

  it("handles partial tabs in nested code and an empty list row before a blank", () => {
    const quote = parseMarkdown(">\t\tconst value = 3;\n").doc.blocks[0]!;
    // Complex quotes are deliberately preserved as a raw block rather than flattened.
    expect(quote.type).toBe("markdownRaw");
    const list = parseMarkdown("* first\n*\n\n* third\n").doc.blocks[0]!;
    expect(list.children.map(text)).toEqual(["first", "", "third"]);
  });

  it("distinguishes a thematic separator from another list row", () => {
    expect(parseMarkdown("- first\n- - -\n- next").doc.blocks.map((block) => block.type)).toEqual([
      "bulletList",
      "divider",
      "bulletList",
    ]);
  });

  it("keeps lazy quote continuation as prose instead of turning it into a heading", () => {
    const quote = parseMarkdown("> first line\nnext line\n===\n").doc.blocks[0]!;
    expect(quote.type).toBe("blockquote");
    // soft line breaks are spaces (CommonMark)
    expect(text(quote)).toBe("first line next line ===");
  });

  it("decodes the full named-reference table, numeric replacement and escaped autolinks", () => {
    const block = parseMarkdown("&NotEqualTilde; &#x1f680; &#0; <person\\+tag@docs.example>").doc
      .blocks[0]!;
    expect(text(block)).toBe("≂̸ 🚀 � <person+tag@docs.example>");
    expect(block.content).toContainEqual({
      text: "person+tag@docs.example",
      marks: [{ type: "link", attrs: { href: "mailto:person+tag@docs.example" } }],
    });
  });

  it("preserves NBSP inside destinations and consumes indentation after a hard break", () => {
    const block = parseMarkdown('[status](/path "literal")\\\n      continuation').doc.blocks[0]!;
    expect(block.content).toEqual([
      { text: "status", marks: [{ type: "link", attrs: { href: '/path "literal"' } }] },
      { text: "\ncontinuation", marks: [] },
    ]);
  });

  it("retains hostile unmatched nesting without recursive exhaustion or lost bytes", () => {
    const source = `${"[".repeat(20_000)}tail\n\n${">".repeat(200)} deep`;
    const parsed = parseMarkdown(source);
    expect(serializeMarkdown(parsed.doc, parsed.snapshot).text).toBe(source);
    expect(text(parsed.doc.blocks[0]!)).toBe(`${"[".repeat(20_000)}tail`);
  });

  it(
    "reads nested quotes and items that lazy lines end once per level (D-160)",
    { timeout: 60_000 },
    () => {
      // level k: a fence in quote or item k, then a line without its `>` or indentation that the
      // fence would take in, so each level reads its content again without that line
      let quotes = "";
      let items = "";
      for (let k = 1; k <= 30; k++) items += `${"  ".repeat(k - 1)}- a\n`;
      for (let k = 30; k >= 1; k--) {
        quotes += `${">".repeat(k)} \`\`\`\n${"> ".repeat(k - 1)}x\n`;
        items += `${"  ".repeat(k)}\`\`\`\n${"  ".repeat(k - 1)}x\n`;
      }
      for (const source of [quotes, items]) {
        const started = performance.now();
        const parsed = parseMarkdown(source);
        expect(performance.now() - started).toBeLessThan(5_000);
        expect(serializeMarkdown(parsed.doc, parsed.snapshot).text).toBe(source);
      }
    },
  );
});
