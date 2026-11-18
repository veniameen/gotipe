import { describe, expect, it, vi } from "vitest";
import { counterIds } from "./__fixtures__/helpers";
import { WIKI_PAGE } from "./__fixtures__/wiki-page";
import { parseMarkdown, serializeMarkdown } from "./index";
import * as model from "./model";
import { hasRichText, richContent, spansText } from "./model";
import type { Block, Doc, MarkdownSnapshot } from "./types";

/** A new block object with `suffix` typed at its end; the other blocks keep their objects. */
function typed(doc: Doc, index: number, suffix: string): Doc {
  const blocks = doc.blocks.slice();
  const block = blocks[index]!;
  const spans = Array.isArray(block.content) ? block.content : [];
  blocks[index] = { ...block, content: [...spans, { text: suffix, marks: [] }] };
  return { version: doc.version + 1, blocks };
}

describe("serializeMarkdown with kept fingerprints", () => {
  it("writes the same bytes, snapshot and map as without them, edit after edit", () => {
    const parsed = parseMarkdown(WIKI_PAGE, { createId: counterIds("b") });
    const fingerprints = new WeakMap<object, string>();
    let doc = parsed.doc;
    let kept: MarkdownSnapshot = parsed.snapshot;
    let plain: MarkdownSnapshot = parsed.snapshot;
    const paragraphs = doc.blocks
      .map((block, index) => (block.type === "paragraph" ? index : -1))
      .filter((index) => index >= 0);
    expect(paragraphs.length).toBeGreaterThan(2);
    for (const [step, index] of [...paragraphs, ...paragraphs].entries()) {
      doc = typed(doc, index, ` правка ${step} 😀`);
      const withKept = serializeMarkdown(doc, kept, { fingerprints });
      const without = serializeMarkdown(doc, plain);
      expect(withKept).toEqual(without);
      expect(withKept.text).not.toBe(kept.text);
      kept = withKept.snapshot;
      plain = without.snapshot;
    }
    expect(parseMarkdown(kept.text).doc.blocks.length).toBe(doc.blocks.length);
  });

  it("fingerprints only the blocks that are new objects", () => {
    const parsed = parseMarkdown(WIKI_PAGE, { createId: counterIds("b") });
    const fingerprints = new WeakMap<object, string>();
    const first = serializeMarkdown(parsed.doc, parsed.snapshot, { fingerprints });
    expect(first.text).toBe(WIKI_PAGE);
    const index = parsed.doc.blocks.findIndex((block) => block.type === "paragraph");
    const next = typed(parsed.doc, index, "!");
    const fingerprint = vi.spyOn(model, "fingerprint");
    const printed = () => new Set(fingerprint.mock.calls.map(([block]) => (block as Block).id));
    serializeMarkdown(next, first.snapshot, { fingerprints });
    const top = new Set(parsed.doc.blocks.map((block) => block.id));
    expect([...printed()].filter((id) => top.has(id))).toEqual([next.blocks[index]!.id]);
    fingerprint.mockClear();
    serializeMarkdown(next, first.snapshot);
    expect([...printed()].filter((id) => top.has(id)).length).toBe(top.size);
    fingerprint.mockRestore();
  });
});

describe("hasRichText", () => {
  it("says what the text of the normalized spans says", () => {
    const contents: Block["content"][] = [
      null,
      "raw",
      "",
      [],
      [{ text: "", marks: [] }],
      [
        { text: "", marks: [{ type: "bold" }] },
        { text: "", marks: [] },
      ],
      [
        { text: "", marks: [] },
        { text: "x", marks: [{ type: "bold" }] },
      ],
      [{ text: " ", marks: [] }],
      [null as never, { text: 1 as never, marks: [] }],
      [undefined as never, { text: "😀", marks: undefined as never }],
    ];
    for (const content of contents) {
      const block: Block = { id: "b", type: "paragraph", attrs: {}, content, children: [] };
      expect(hasRichText(block)).toBe(spansText(richContent(block)).length > 0);
    }
  });
});
