import { describe, expect, it } from "vitest";
import nested from "../../../crates/gotipe-export/tests/fixtures/markdown-nested-write-read.json";
import fixture from "../../../crates/gotipe-export/tests/fixtures/markdown-write-read.json";
import { parseMarkdown, serializeMarkdown } from "./index";
import type { Block, Doc, Span } from "./types";

interface Fixture {
  read: { id: string; markdown: string; blocks: unknown[] }[];
  /** `readAsRaw`: the reader keeps the blocks as raw source (a list in a quote, D-104). */
  write: {
    id: string;
    document: unknown;
    markdown: string;
    reparsed: unknown[];
    readAsRaw?: boolean;
  }[];
}

/** The shared cases: the Rust reader and writer check them too (tests/markdown_write_read.rs). */
const FIXTURES: [string, Fixture][] = [
  ["D-97", fixture],
  ["D-101, D-103, D-104, D-105", nested],
];

/** Blocks without ids: what a parse means, independent of generated ids. */
function strip(block: Block): unknown {
  return {
    type: block.type,
    attrs: block.attrs,
    content: block.content,
    children: (block.children ?? []).map(strip),
  };
}

/**
 * The rich text of every block with text, in order: what writing and reading must not change
 * (an empty paragraph or heading is not written).
 */
const texts = (blocks: readonly Block[]): unknown[] =>
  blocks.flatMap((block) => [
    ...(Array.isArray(block.content) && block.content.length > 0 ? [block.content] : []),
    ...texts(block.children ?? []),
  ]);

describe.each(FIXTURES)("a written document reads back as itself (%s)", (_name, cases) => {
  it.each(cases.read)("reads $id as the Rust reader does and keeps its bytes", (entry) => {
    const { doc, snapshot } = parseMarkdown(entry.markdown);
    expect(doc.blocks.map(strip)).toEqual(entry.blocks);
    expect(serializeMarkdown(doc, snapshot).text).toBe(entry.markdown);
  });

  it.each(cases.write)("writes $id as the Rust writer does and reads it back", (entry) => {
    const document = entry.document as Doc;
    const text = serializeMarkdown(document).text;
    expect(text).toBe(entry.markdown);
    const read = parseMarkdown(text).doc.blocks;
    expect(read.map(strip)).toEqual(entry.reparsed);
    if (!entry.readAsRaw) expect(texts(read)).toEqual(texts(document.blocks));
  });
});

describe("typed addresses (D-97)", () => {
  it("writes typed addresses so that no reader takes them for links", () => {
    const text = "see www.e.x, https://e.x/a?b=1 and a.www.b@c.de";
    const written = serializeMarkdown({
      version: 1,
      blocks: [
        { id: "p", type: "paragraph", attrs: {}, content: [{ text, marks: [] }], children: [] },
      ],
    }).text;
    expect(written).toBe("see www\\.e.x, https\\://e.x/a?b=1 and a.www\\.b\\@c.de\n");
    expect(parseMarkdown(written).doc.blocks[0]!.content).toEqual([{ text, marks: [] }]);
  });
});

describe("a large block (D-96)", () => {
  const paragraph = (spans: Span[]): Doc => ({
    version: 1,
    blocks: [{ id: "p", type: "paragraph", attrs: {}, content: spans, children: [] }],
  });
  const dollar = String.fromCharCode(36);

  it.each([
    ["words", Array.from({ length: 100_000 }, (_, i) => `word${i % 97} 1. a.b`).join(" ")],
    // an escape does not make the rest of a run of addresses be read again
    ["addresses", "https://e.x/p,".repeat(20_000)],
    // nor does an escaped dollar make the formula look-ahead read past it again
    ["dollars", `${`${dollar}5, `.repeat(20_000)}US${dollar}`],
  ])("of %s is written in linear time", (_name, text) => {
    const started = performance.now();
    expect(serializeMarkdown(paragraph([{ text, marks: [] }])).text.length).toBeGreaterThan(
      text.length,
    );
    // quadratic writing took about 30 s for 100 000 words
    expect(performance.now() - started).toBeLessThan(5_000);
  });

  it("with custom emoji and a long word of colons is written in linear time", () => {
    const json = JSON.stringify(Array.from({ length: 20_000 }, (_, i) => ({ id: i, at: "10:30" })));
    const emoji = { type: "customEmoji", attrs: { name: "party", src: "p.png" } };
    const started = performance.now();
    serializeMarkdown(
      paragraph([
        { text: json, marks: [] },
        { text: ":party:", marks: [emoji] },
      ]),
    );
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});

describe("a formula with a line ending in it (D-94)", () => {
  it("is written as text: a line ending would end the formula", () => {
    const doc: Doc = {
      version: 1,
      blocks: [
        {
          id: "p",
          type: "paragraph",
          attrs: {},
          content: [
            { text: "a", marks: [] },
            { text: "x\ry", marks: [{ type: "inlineMath" }] },
            { text: "b", marks: [] },
          ],
          children: [],
        },
      ],
    };
    expect(serializeMarkdown(doc).text).toBe("ax\\\nyb\n");
  });
});
