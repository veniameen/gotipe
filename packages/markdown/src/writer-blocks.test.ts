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
