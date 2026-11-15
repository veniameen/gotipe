import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./index";
import type { Block, Doc } from "./types";

// The cases both engines share are in crates/gotipe-export/tests/fixtures/markdown-nested-write-read.json.
let next = 0;
const text = (value: string) => (value ? [{ text: value, marks: [] }] : []);
const item = (value: string, children: Block[] = []): Block => ({
  id: `i${++next}`,
  type: "listItem",
  attrs: {},
  content: text(value),
  children,
});
const list = (items: Block[], attrs: Record<string, unknown> = {}): Block => ({
  id: `l${++next}`,
  type: "bulletList",
  attrs,
  content: null,
  children: items,
});
const quote = (value: string, children: Block[], type = "blockquote"): Block => ({
  id: `q${++next}`,
  type,
  attrs: type === "callout" ? { type: "note" } : {},
  content: text(value),
  children,
});
const doc = (...blocks: Block[]): Doc => ({ version: 1, blocks });
const types = (markdown: string) => parseMarkdown(markdown).doc.blocks.map((block) => block.type);

describe("a line without indentation after a list item (D-101)", () => {
  it("is a paragraph where the item has no text open, and stays one through edits", () => {
    const source = "- x\n-\nb\n";
    const { doc: read, snapshot } = parseMarkdown(source);
    expect(read.blocks.map((block) => block.type)).toEqual(["bulletList", "paragraph"]);
    // the gap without a blank line reads the same with the paragraph edited
    const edited = structuredClone(read);
    edited.blocks[1]!.content = text("b!");
    expect(serializeMarkdown(edited, snapshot).text).toBe("- x\n-\nb!\n");
    // an item given text would take the line in: a blank line keeps the paragraph apart
    const filled = structuredClone(read);
    filled.blocks[0]!.children[1]!.content = text("y");
    const written = serializeMarkdown(filled, snapshot).text;
    expect(written).toBe("- x\n- y\n\nb\n");
    expect(types(written)).toEqual(["bulletList", "paragraph"]);
  });

  it(
    "is read in time that grows with the document, not with its square",
    { timeout: 60_000 },
    () => {
      const words = Array.from({ length: 2_000 }, (_, i) => `w${i}`).join("\n");
      let deep = "";
      for (let depth = 0; depth < 64; depth++)
        deep += `${"  ".repeat(depth)}- ${"word ".repeat(50)}\n`;
      for (const source of [
        // every item ends before its lazy line
        Array.from({ length: 20_000 }, (_, i) => `-\nb${i}\n`).join("\n"),
        // a lazy line after every quoted line of an item
        `- a\n${Array.from({ length: 20_000 }, (_, i) => (i % 2 ? `w${i}` : `  > q${i}`)).join("\n")}`,
        // the line ends a list 64 levels deep, level by level: each level reads it once
        `${deep}${"  ".repeat(64)}-\n${words}`,
      ]) {
        const started = performance.now();
        parseMarkdown(source);
        expect(performance.now() - started).toBeLessThan(5_000);
      }
    },
  );
});

describe("a list in a quote or a callout (D-104)", () => {
  it("keeps the `>` on the blank lines of a loose list", () => {
    const loose = list([item("a", [list([item("x"), item("y")], { spread: true })]), item("b")], {
      spread: true,
    });
    const cases: [Block, string][] = [
      [quote("q", [loose]), "> q\n>\n> - a\n> \n>   - x\n> \n>   - y\n> \n> - b\n"],
      [
        quote("c", [loose], "callout"),
        "> [!NOTE]\n> c\n>\n> - a\n> \n>   - x\n> \n>   - y\n> \n> - b\n",
      ],
      [
        quote("q", [quote("r", [loose])]),
        "> q\n>\n> > r\n> >\n> > - a\n> > \n> >   - x\n> > \n> >   - y\n> > \n> > - b\n",
      ],
    ];
    for (const [block, expected] of cases) {
      const written = serializeMarkdown(doc(block)).text;
      expect(written).toBe(expected);
      // a list in a quote is read as one raw block, not torn in two by a blank line
      const read = parseMarkdown(written).doc.blocks;
      expect(read).toHaveLength(1);
      expect(read[0]).toMatchObject({ type: "markdownRaw", content: expected.trimEnd() });
    }
  });

  it("leaves the blank lines of a list outside quotes empty", () => {
    const loose = list([item("a", [list([item("x"), item("y")], { spread: true })]), item("b")], {
      spread: true,
    });
    expect(serializeMarkdown(doc(loose)).text).toBe("- a\n\n  - x\n\n  - y\n\n- b\n");
  });
});

describe("neighbouring lists in an item (D-105)", () => {
  // raw source is written as it is: the list beside it takes another marker, as at the top
  // level; tests/markdown_write_read.rs checks the Rust writer writes the same
  const raw: Block = {
    id: "r",
    type: "markdownRaw",
    attrs: { kind: "list" },
    content: "- # a",
    children: [],
  };

  it("give the list beside raw source another marker, before it or after it", () => {
    expect(serializeMarkdown(doc(list([item("x", [raw, list([item("c")])])]))).text).toBe(
      "- x\n  - # a\n  * c\n",
    );
    const after = list([item("x", [list([item("c")]), raw, list([item("d")], { marker: "*" })])]);
    expect(serializeMarkdown(doc(after)).text).toBe("- x\n  * c\n  - # a\n  * d\n");
  });

  it("take other markers around a list without items, which writes no line", () => {
    // neither writer writes the empty list (D-117, tests/markdown_write_read.rs)
    const around = list([item("x", [list([item("a")]), list([]), list([item("b")])])]);
    const written = serializeMarkdown(doc(around)).text;
    expect(written).toBe("- x\n  - a\n  * b\n");
    const nested = parseMarkdown(written).doc.blocks[0]!.children[0]!.children;
    expect(nested.map((block) => block.attrs.marker)).toEqual(["-", "*"]);
  });

  it("keep their own markers where a block keeps them apart", () => {
    const code: Block = { id: "c", type: "codeBlock", attrs: {}, content: "c", children: [] };
    const apart = list([item("x", [list([item("a")]), code, list([item("b")])])]);
    expect(serializeMarkdown(doc(apart)).text).toBe("- x\n  - a\n  ```\n  c\n  ```\n  - b\n");
  });

  it("are two raw lists in a toggle too: the items of the later take another marker (D-111)", () => {
    const rawList = (content: string): Block => ({ ...raw, id: `r${++next}`, content });
    const toggle: Block = {
      id: "t",
      type: "toggle",
      attrs: {},
      content: text("T"),
      children: [rawList("- a\n\n  b"), rawList("- c\n\n  d")],
    };
    const written = serializeMarkdown(doc(toggle)).text;
    expect(written).toBe("T\n\n- a\n\n  b\n\n* c\n\n  d\n");
    expect(types(written)).toEqual(["paragraph", "markdownRaw", "markdownRaw"]);
  });
});
