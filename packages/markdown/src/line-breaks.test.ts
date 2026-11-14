import { describe, expect, it } from "vitest";
import fixture from "../../../crates/gotipe-export/tests/fixtures/markdown-line-breaks.json";
import parity from "../../../crates/gotipe-export/tests/markdown_fixtures.json";
import { mdOffsetToText, parseMarkdown, serializeMarkdown, textOffsetToMd } from "./index";
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

const plain = (text: string): Span[] => [{ text, marks: [] }];
const lines = (text: string) => text.split(/\r?\n/);
/** The lines of `after` that are not lines of `before` (a file diff's added lines). */
const rewritten = (before: string, after: string) => {
  const kept = new Set(lines(before));
  return lines(after).filter((line) => !kept.has(line));
};

describe("soft and hard line breaks (D-88)", () => {
  // The Rust reader and writer check the same fixture (tests/markdown_line_breaks.rs).
  it.each(fixture.read)("reads $id as CommonMark does and keeps its bytes", (entry) => {
    const { doc, snapshot } = parseMarkdown(entry.markdown);
    expect(doc.blocks.map(strip)).toEqual(entry.blocks);
    expect(serializeMarkdown(doc, snapshot).text).toBe(entry.markdown);
  });

  it.each(fixture.write)("writes $id as the Rust writer does and reads it back", (entry) => {
    const text = serializeMarkdown(entry.document as Doc).text;
    expect(text).toBe(entry.markdown);
    expect(parseMarkdown(text).doc.blocks.map(strip)).toEqual(entry.reparsed);
  });

  // The Rust reader's own cases (tests/markdown_parity.rs): one meaning for both readers.
  it.each(parity.map((entry, index) => ({ ...entry, index })))(
    "reads the Rust parity case $index as the Rust reader does",
    (entry) => {
      const { doc, snapshot } = parseMarkdown(entry.markdown);
      expect(doc.blocks.map(strip)).toEqual(entry.blocks);
      expect(serializeMarkdown(doc, snapshot).text).toBe(entry.markdown);
    },
  );
});

describe("an edited block keeps the lines of its soft breaks (D-88)", () => {
  function edit(source: string, change: (doc: Doc) => void) {
    const { doc, snapshot } = parseMarkdown(source);
    change(doc);
    return serializeMarkdown(doc, snapshot);
  }

  it("rewrites only the line an edit touches", () => {
    // the landing page's sample: the demo counts the lines the writer rewrites
    const source =
      "# Everything here syncs live\n\n**Every block is a transaction** the engine\nreplays. Two cursors, one document.\n";
    const { text } = edit(source, (doc) => {
      const p = doc.blocks[1]!.content as Span[];
      p[1] = { text: " the engine replays. Two cursors, one shared document.", marks: [] };
    });
    expect(text).toBe(
      "# Everything here syncs live\n\n**Every block is a transaction** the engine\nreplays. Two cursors, one shared document.\n",
    );
    expect(rewritten(source, text)).toEqual(["replays. Two cursors, one shared document."]);
  });

  it("keeps the lines between two edits, and joins two lines only when the break goes", () => {
    const source = "Первая строка абзаца\nвторая строка\nтретья строка\nчетвёртая строка 😀\n";
    const twoEdits = edit(source, (doc) => {
      doc.blocks[0]!.content = plain(
        "Первая строка правки второй строка третья строка четвёртая строка 😀!",
      );
    }).text;
    expect(twoEdits).toBe(
      "Первая строка правки второй строка\nтретья строка\nчетвёртая строка 😀!\n",
    );
    // a deleted word at the end of a line: that line is shorter, the next one stays
    const deleted = edit(source, (doc) => {
      doc.blocks[0]!.content = plain(
        "Первая строка абзаца вторая третья строка четвёртая строка 😀",
      );
    }).text;
    expect(deleted).toBe("Первая строка абзаца\nвторая\nтретья строка\nчетвёртая строка 😀\n");
    // the words on both sides of a break joined into one: the two lines are one
    const joined = edit(source, (doc) => {
      doc.blocks[0]!.content = plain(
        "Первая строка абзацавторая строка третья строка четвёртая строка 😀",
      );
    }).text;
    expect(joined).toBe("Первая строка абзацавторая строка\nтретья строка\nчетвёртая строка 😀\n");
  });

  it("keeps the lines of list items, quotes and callouts when the block is rewritten", () => {
    const source = [
      "- first item",
      "  goes on",
      "- second item",
      "  goes on too",
      "",
      "> a quote",
      "> on two lines",
      "",
      "> [!NOTE]",
      "> a note",
      "> on two lines",
      "",
    ].join("\n");
    const { text } = edit(source, (doc) => {
      doc.blocks[0]!.children[1]!.content = plain("second item goes on, edited");
      doc.blocks[1]!.content = plain("a quote on two lines!");
      doc.blocks[2]!.content = plain("a new note on two lines");
    });
    expect(text).toBe(
      [
        "- first item",
        "  goes on",
        "- second item",
        "  goes on, edited",
        "",
        "> a quote",
        "> on two lines!",
        "",
        "> [!NOTE]",
        "> a new note",
        "> on two lines",
        "",
      ].join("\n"),
    );
  });

  it("keeps them over a second edit, from the snapshot the writer returned", () => {
    const source = "one two\nthree four\nfive six\n";
    const { doc, snapshot } = parseMarkdown(source);
    doc.blocks[0]!.content = plain("one two three four five six seven");
    const first = serializeMarkdown(doc, snapshot);
    expect(first.text).toBe("one two\nthree four\nfive six seven\n");
    doc.blocks[0]!.content = plain("zero one two three four five six seven");
    const second = serializeMarkdown(doc, first.snapshot);
    expect(second.text).toBe("zero one two\nthree four\nfive six seven\n");
  });

  it("uses the file's CRLF, keeps a soft break in code and writes a typed break as a hard one", () => {
    const source = "a `code\r\nspan` b\r\nc d\r\n";
    const { text } = edit(source, (doc) => {
      const spans = doc.blocks[0]!.content as Span[];
      expect(spans[1]).toEqual({ text: "code span", marks: [{ type: "code" }] });
      spans[2] = { text: " b c\nd!", marks: [] };
    });
    expect(text).toBe("a `code\r\nspan` b\r\nc\\\r\nd!\r\n");
  });

  it("maps a soft break of the text to the line ending in the file", () => {
    const { map, text } = edit("alpha beta\ngamma\n", (doc) => {
      doc.blocks[0]!.content = plain("alpha beta gamma!");
    });
    expect(text).toBe("alpha beta\ngamma!\n");
    const block = map.blocks[0]!.blockId;
    expect(textOffsetToMd(map, block, 10)).toBe(10);
    expect(textOffsetToMd(map, block, 11)).toBe(11);
    expect(mdOffsetToText(map, 11)).toEqual({ blockId: block, offset: 11 });
  });

  it("writes a block new to the file on one line: there is nothing to keep", () => {
    const { doc, snapshot } = parseMarkdown("first\n");
    doc.blocks.push({
      id: "new",
      type: "paragraph",
      attrs: {},
      content: plain("one two"),
      children: [],
    });
    expect(serializeMarkdown(doc, snapshot).text).toBe("first\n\none two\n");
  });
});
