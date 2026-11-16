import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./index";
import type { Block, Doc } from "./types";

/**
 * Cases of the writer that the Rust writer does not share yet; the shared ones are in
 * `crates/gotipe-export/tests/fixtures/markdown-writer-blocks.json` (`write-read.test.ts`).
 */
let next = 0;
const block = (type: string, text: string | null, children: Block[] = [], attrs = {}): Block => ({
  id: `b${++next}`,
  type,
  attrs,
  content: text === null ? null : text ? [{ text, marks: [] }] : [],
  children,
});
const item = (text: string, children: Block[] = []) => block("listItem", text, children);
const list = (items: Block[], attrs = {}) => block("bulletList", null, items, attrs);
const doc = (...blocks: Block[]): Doc => ({ version: 1, blocks });

/** Blocks without ids. */
function strip(b: Block): unknown {
  return {
    type: b.type,
    attrs: b.attrs,
    content: b.content,
    children: (b.children ?? []).map(strip),
  };
}

describe("an item without text (D-117)", () => {
  it("of a spread list keeps its children: no blank line follows its marker", () => {
    const text = serializeMarkdown(
      doc(list([item("", [list([item("x")])]), item("b")], { spread: true })),
    ).text;
    expect(text).toBe("-\n  - x\n\n- b\n");
    const read = parseMarkdown(text).doc.blocks.map(strip);
    expect(read).toEqual([
      {
        type: "bulletList",
        attrs: { marker: "-", spread: true },
        content: null,
        children: [
          {
            type: "listItem",
            attrs: {},
            content: [],
            children: [
              {
                type: "bulletList",
                attrs: { marker: "-", spread: false },
                content: null,
                children: [
                  {
                    type: "listItem",
                    attrs: {},
                    content: [{ text: "x", marks: [] }],
                    children: [],
                  },
                ],
              },
            ],
          },
          { type: "listItem", attrs: {}, content: [{ text: "b", marks: [] }], children: [] },
        ],
      },
    ]);
  });
});

describe("a paragraph whose source starts with a line of its own `$$` (D-109)", () => {
  // without a closing line the `$$` is text: `$$ x`
  const source = "$$\nx\n\nfoo\n";
  const formula = (): Block => ({ id: "f", type: "math", attrs: {}, content: "y", children: [] });
  const types = (text: string) => parseMarkdown(text).doc.blocks.map((b) => b.type);

  it("untouched, is written on one line where a later `$$` line would close it", () => {
    const { doc: read, snapshot } = parseMarkdown(source);
    const text = serializeMarkdown({ ...read, blocks: [...read.blocks, formula()] }, snapshot).text;
    expect(text).toBe("$$ x\n\nfoo\n\n$$\ny\n$$\n");
    expect(types(text)).toEqual(["paragraph", "paragraph", "math"]);
  });

  it("edited, does not keep the line break after `$$`", () => {
    const { doc: read, snapshot } = parseMarkdown(source);
    const edited = { ...read.blocks[0]!, content: [{ text: "$$ xz", marks: [] }] };
    const blocks = [edited, read.blocks[1]!, formula()];
    const text = serializeMarkdown({ ...read, blocks }, snapshot).text;
    expect(text).toBe("$$ xz\n\nfoo\n\n$$\ny\n$$\n");
    expect(types(text)).toEqual(["paragraph", "paragraph", "math"]);
  });

  it("keeps its bytes while no later line closes it", () => {
    const { doc: read, snapshot } = parseMarkdown(source);
    const bar = block("paragraph", "bar");
    const text = serializeMarkdown({ ...read, blocks: [...read.blocks, bar] }, snapshot).text;
    expect(text).toBe("$$\nx\n\nfoo\n\nbar\n");
  });
});

describe("a block with its children at its level, written as its source (D-215)", () => {
  const toggle = (text: string, children: Block[]) => block("toggle", text, children);
  /** The file written from `before`, then from `after` with the snapshot of the first writing. */
  const rewritten = (before: Block[], after: Block[]): string =>
    serializeMarkdown(doc(...after), serializeMarkdown(doc(...before)).snapshot).text;
  const lists = (text: string) => parseMarkdown(text).doc.blocks.map((b) => b.children?.length);

  it.each([
    [
      "a new list before a toggle starting with a list",
      "- a\n\n* x\n",
      (t: Block) => [list([item("a")]), t],
    ],
    ["a new list after it", "- x\n\n* b\n", (t: Block) => [t, list([item("b")])]],
  ])("is written again next to %s, as without the snapshot", (_name, text, around) => {
    const t = toggle("", [list([item("x")])]);
    const written = rewritten([t], around(t));
    expect(written).toBe(text);
    expect(written).toBe(serializeMarkdown(doc(...around(t))).text);
    expect(lists(written)).toEqual([1, 1]);
  });

  it("is written again where the protection gives its neighbour another marker", () => {
    const b = list([item("b")]);
    const t = toggle("", [list([item("x")], { marker: "*" })]);
    const after = [list([item("a")]), b, t];
    const written = rewritten([b, t], after);
    expect(written).toBe("- a\n\n+ b\n\n* x\n");
    expect(written).toBe(serializeMarkdown(doc(...after)).text);
    expect(lists(written)).toEqual([1, 1, 1]);
  });

  it("ending with a list, a paragraph or columns stay apart from a new list", () => {
    const p = block("paragraph", "p", [list([item("x")])]);
    expect(rewritten([p], [p, list([item("b")])])).toBe("p\n\n- x\n\n* b\n");
    const column = (children: Block[]) => block("column", null, children);
    const c = block("columns", null, [
      column([block("paragraph", "c")]),
      column([list([item("x")])]),
    ]);
    expect(rewritten([c], [c, list([item("b")])])).toBe("c\n\n- x\n\n* b\n");
  });

  it("keeps its bytes where its neighbours are untouched", () => {
    const blocks = [list([item("b")]), toggle("T", [list([item("x")])]), list([item("c")])];
    const first = serializeMarkdown(doc(...blocks));
    expect(first.text).toBe("- b\n\nT\n\n- x\n\n* c\n");
    expect(serializeMarkdown(doc(...blocks), first.snapshot).text).toBe(first.text);
  });
});

describe("an item of a bullet list with `checked`, a task (D-156)", () => {
  it("is written again when its mark changes after reading", () => {
    const { doc: read, snapshot } = parseMarkdown("- a\n\nb\n");
    const [bullets, after] = read.blocks as [Block, Block];
    const task = { ...bullets.children![0]!, attrs: { checked: false } };
    const text = serializeMarkdown(
      { ...read, blocks: [{ ...bullets, children: [task] }, after] },
      snapshot,
    ).text;
    expect(text).toBe("- [ ] a\n\nb\n");
  });
});
