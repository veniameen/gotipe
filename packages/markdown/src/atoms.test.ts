import { describe, expect, it } from "vitest";
import fixture from "../../../crates/gotipe-export/tests/fixtures/markdown-atoms.json";
import { type InlineAtoms, parseMarkdown, serializeMarkdown } from "./index";
import type { Block, Doc, Span } from "./types";

/** Blocks without ids: what a parse means, independent of generated ids. */
function strip(block: Block): unknown {
  return {
    type: block.type,
    attrs: block.attrs,
    content: block.content,
    children: (block.children ?? []).map(strip),
  };
}

const ALL: InlineAtoms = {
  mention: true,
  inlineMath: true,
  inlineImage: true,
  customEmoji: { party: "https://cdn.test/party.png" },
};

const paragraph = (id: string, content: Span[]): Block => ({
  id,
  type: "paragraph",
  attrs: {},
  content,
  children: [],
});

const spans = (block: Block | undefined): Span[] =>
  Array.isArray(block?.content) ? block.content : [];

describe("inline atoms in Markdown", () => {
  // The Rust reader and writer check the same fixture (tests/markdown_atoms.rs).
  it.each(fixture.read)("reads $id and keeps its bytes", (entry) => {
    const { doc, snapshot } = parseMarkdown(entry.markdown, { atoms: entry.atoms as InlineAtoms });
    expect(doc.blocks.map(strip)).toEqual(entry.blocks);
    expect(serializeMarkdown(doc, snapshot).text).toBe(entry.markdown);
  });

  it.each(fixture.write)("writes $id as the Rust writer does and reads it back", (entry) => {
    const text = serializeMarkdown(entry.document as Doc).text;
    expect(text).toBe(entry.markdown);
    const atoms = entry.atoms as InlineAtoms;
    expect(parseMarkdown(text, { atoms }).doc.blocks.map(strip)).toEqual(entry.reparsed);
  });

  it("is opt-in: without `atoms` the same source reads as before", () => {
    const source = "[@Анна](mention:user-42) $x^2$ :party: и ![alt](a.png)\n";
    expect(parseMarkdown(source).doc.blocks[0]!.content).toEqual([
      { text: "@Анна", marks: [{ type: "link", attrs: { href: "mention:user-42" } }] },
      { text: " $x^2$ :party: и ", marks: [] },
      { text: "![alt](a.png)", marks: [{ type: "mdRaw" }] },
    ]);
    expect(parseMarkdown(source, { atoms: {} }).doc.blocks).toHaveLength(1);
    expect(parseMarkdown(source, { atoms: {} }).doc.blocks[0]!.content).toEqual(
      parseMarkdown(source).doc.blocks[0]!.content,
    );
  });

  it("keeps the bytes of untouched blocks when another block is edited", () => {
    const source = [
      "Привет,   [@Анна](<mention:user-42>)   и  $x^2$ !",
      "",
      "* :party:  ![Схема](img/a.png) конец",
      "",
      "Цена \\$5 и $\\alpha$😀",
      "",
    ].join("\r\n");
    const { doc, snapshot } = parseMarkdown(source, { atoms: ALL });
    expect(serializeMarkdown(doc, snapshot).text).toBe(source);
    const last = doc.blocks[2]!;
    expect(spans(last)).toEqual([
      { text: "Цена $5 и ", marks: [] },
      { text: "\\alpha", marks: [{ type: "inlineMath", attrs: { key: "5" } }] },
      { text: "😀", marks: [] },
    ]);
    last.content = [...spans(last).slice(0, 2), { text: "😀 $y$", marks: [] }];
    const edited = serializeMarkdown(doc, snapshot).text.split("\r\n");
    expect(edited.slice(0, 4)).toEqual(source.split("\r\n").slice(0, 4));
    // Typed dollars that would read back as a formula are escaped; the formula is not.
    expect(edited[4]).toBe("Цена $5 и $\\alpha$😀 \\$y$");
    const again = parseMarkdown(edited.join("\r\n"), { atoms: ALL }).doc.blocks[2]!;
    expect(spans(again)).toEqual(spans(last));
  });

  it("round-trips atoms with their own keys, marks and Unicode through its output", () => {
    const mention = { id: "ю/42 (a)", kind: "user", label: "Анна" };
    const doc: Doc = {
      version: 1,
      blocks: [
        paragraph("a", [
          { text: "@Анна", marks: [{ type: "mention", attrs: { ...mention, key: "k1" } }] },
          { text: "@Анна", marks: [{ type: "mention", attrs: { ...mention, key: "k2" } }] },
          { text: " 😀 ", marks: [] },
          { text: "\\sum_{i=1}^n i_*", marks: [{ type: "bold" }, { type: "inlineMath" }] },
          { text: "7 штук_ и ", marks: [] },
          {
            text: ":party:",
            marks: [{ type: "customEmoji", attrs: { name: "party", src: ALL.customEmoji!.party } }],
          },
          { text: "![не картинка](x) [@нет](mention:user-1) :party\\:", marks: [] },
        ]),
        paragraph("b", [
          {
            text: "a [b] *c*",
            marks: [{ type: "inlineImage", attrs: { src: "a(b.png", alt: "a [b] *c*" } }],
          },
          { text: " и ", marks: [] },
          {
            text: "другой alt",
            marks: [{ type: "inlineImage", attrs: { src: "i.png", alt: "x_y*z" } }],
          },
        ]),
      ],
    };
    const text = serializeMarkdown(doc).text;
    const back = parseMarkdown(text, { atoms: ALL }).doc;
    const first = spans(back.blocks[0]);
    expect(first.map((span) => span.text).join("")).toBe(
      spans(doc.blocks[0])
        .map((span) => span.text)
        .join(""),
    );
    expect(first.slice(0, 2)).toEqual([
      // Every atom read gets its own key, in document order.
      { text: "@Анна", marks: [{ type: "mention", attrs: { ...mention, key: "1" } }] },
      { text: "@Анна", marks: [{ type: "mention", attrs: { ...mention, key: "2" } }] },
    ]);
    expect(first[3]).toEqual({
      text: "\\sum_{i=1}^n i_*",
      marks: [{ type: "bold" }, { type: "inlineMath", attrs: { key: "3" } }],
    });
    expect(first.at(-1)).toEqual({
      text: "![не картинка](x) [@нет](mention:user-1) :party\\:",
      marks: [],
    });
    expect(spans(back.blocks[1])).toEqual([
      {
        text: "a [b] *c*",
        marks: [{ type: "inlineImage", attrs: { src: "a(b.png", alt: "a [b] *c*", key: "5" } }],
      },
      { text: " и ", marks: [] },
      // The alt is what Markdown carries: after a reload it is the fallback text again.
      {
        text: "x_y*z",
        marks: [{ type: "inlineImage", attrs: { src: "i.png", alt: "x_y*z", key: "6" } }],
      },
    ]);
    // A second pass is stable: the reader's keys and attributes write the same bytes.
    expect(serializeMarkdown(back).text.split("\n")[0]).toBe(text.split("\n")[0]);
  });

  it("never turns typed dollars into a formula on reload", () => {
    for (const typed of [
      "$x$",
      "a $x$ b",
      "$a$ и $b$",
      "$$x$$",
      "$x$5 и $y$",
      "\\$x$ и $\\alpha$",
      "цена $5, а не $6",
      "$a$5 и 5$",
      "$*x*$ `c` $y$",
      "$ x$ $y $",
    ]) {
      const doc: Doc = { version: 1, blocks: [paragraph("p", [{ text: typed, marks: [] }])] };
      const text = serializeMarkdown(doc).text;
      const read = parseMarkdown(text, { atoms: { inlineMath: true } }).doc.blocks[0];
      expect(spans(read), text).toEqual([{ text: typed, marks: [] }]);
      // A reader without formulas sees the same text.
      expect(spans(parseMarkdown(text).doc.blocks[0]), text).toEqual([{ text: typed, marks: [] }]);
    }
    const untouched: Doc = {
      version: 1,
      blocks: [paragraph("p", [{ text: "цена $5 and $6, скидка 5 $", marks: [] }])],
    };
    expect(serializeMarkdown(untouched).text).toBe("цена $5 and $6, скидка 5 $\n");
  });

  it("writes a formula that the rule cannot carry as its text", () => {
    for (const tex of [" x", "x ", "a$b", "a\nb", "x\\", "$"]) {
      const doc: Doc = {
        version: 1,
        blocks: [
          paragraph("p", [
            { text: "до ", marks: [] },
            { text: tex, marks: [{ type: "inlineMath" }] },
            { text: " после", marks: [] },
          ]),
        ],
      };
      const text = serializeMarkdown(doc).text;
      const read = parseMarkdown(text, { atoms: { inlineMath: true } }).doc.blocks[0];
      expect(
        spans(read)
          .map((span) => span.text)
          .join(""),
        text,
      ).toBe(`до ${tex} после`);
      expect(
        spans(read).every((span) => span.marks.length === 0),
        text,
      ).toBe(true);
    }
  });

  it("maps atom text to its source range", () => {
    const source = "a [@Анна](mention:user-42) $x^2$ :party: ![Схема](i.png) z\n";
    const { doc, snapshot } = parseMarkdown(source, { atoms: ALL });
    const text = spans(doc.blocks[0])
      .map((span) => span.text)
      .join("");
    expect(text).toBe("a @Анна x^2 :party: Схема z");
    const segments = snapshot.blocks[0]!.segments;
    const sourceOf = (from: number, to: number) => {
      const covering = segments.filter((s) => s.textFrom < to && s.textTo > from);
      return source.slice(
        Math.min(...covering.map((s) => s.mdFrom)),
        Math.max(...covering.map((s) => s.mdTo)),
      );
    };
    expect(sourceOf(2, 7)).toBe("@Анна");
    expect(sourceOf(8, 11)).toBe("x^2");
    expect(sourceOf(12, 19)).toBe(":party:");
    expect(sourceOf(20, 25)).toBe("![Схема](i.png)");
    for (const s of segments) {
      expect(s.textFrom).toBeLessThanOrEqual(s.textTo);
      expect(s.mdFrom).toBeLessThanOrEqual(s.mdTo);
      if (s.exact) expect(text.slice(s.textFrom, s.textTo)).toBe(source.slice(s.mdFrom, s.mdTo));
    }
    const written = serializeMarkdown(doc);
    expect(written.text).toBe(source);
  });
});
