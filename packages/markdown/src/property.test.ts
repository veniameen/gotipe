import { describe, expect, it } from "vitest";
import { mulberry32 } from "./__fixtures__/helpers";
import { fingerprint, parseMarkdown, serializeMarkdown } from "./index";
import type { Block, Doc, Mark, Span } from "./types";

/**
 * Property: parse(serialize(doc)).doc equals doc, ignoring ids and Markdown style
 * attrs (marker, delimiter, spread, breaks) — compared through `fingerprint`.
 *
 * Generator restrictions (documented limitations, not tested here):
 * - no "\n" inside inline code (only representable as a real line break in some contexts);
 * - inside table cells, inline code never contains a backslash directly before `|`
 *   (GFM cannot express `\|` literally inside code in a cell);
 * - no text that GFM autolinks (`www.`, `http://`, e-mails): the parser turns it into links;
 * - no empty rich text in paragraphs/headings (skipped by the serializer).
 */
const CHARS = Array.from("*_`[]()<>#|~!\\&-+.:=0123456789 aбвЁё😀   \t");
const HREFS = ["https://e.x/a_b?q=1&r=2", "#frag", "rel/путь (1).md", "", "a\\b", "x)y", "<z>"];

function generator(seed: number) {
  const rng = mulberry32(seed);
  const pick = <T>(a: T[]): T => a[Math.floor(rng() * a.length)]!;
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  let n = 0;
  const id = () => `b${++n}`;
  const text = (allowNl: boolean, max = 6) => {
    let s = "";
    const len = int(1, max);
    for (let i = 0; i < len; i++) s += allowNl && rng() < 0.06 ? "\n" : pick(CHARS);
    return s;
  };
  const spans = (ctx: "block" | "cell" | "heading"): Span[] => {
    const out: Span[] = [];
    const k = int(1, 4);
    for (let i = 0; i < k; i++) {
      const marks: Mark[] = [];
      const code = rng() < 0.15;
      if (rng() < 0.25) marks.push({ type: "bold" });
      if (rng() < 0.25) marks.push({ type: "italic" });
      if (rng() < 0.15) marks.push({ type: "strikethrough" });
      if (rng() < 0.1) marks.push({ type: "underline" });
      if (rng() < 0.08) marks.push({ type: "highlight" });
      const sc = rng();
      if (sc < 0.05) marks.push({ type: "superscript" });
      else if (sc < 0.1) marks.push({ type: "subscript" });
      if (rng() < 0.12) {
        const attrs: Record<string, unknown> = { href: pick(HREFS) };
        if (rng() < 0.3) attrs.title = text(false, 4);
        marks.push({ type: "link", attrs });
      }
      let t = text(!code, 6);
      if (code) {
        marks.push({ type: "code" });
        if (ctx === "cell") t = t.replace(/\\\|/g, "\\a");
      }
      out.push({ text: t, marks });
    }
    return out;
  };
  const rich = (type: string, attrs: Record<string, unknown>, ctx: "block" | "cell" | "heading") =>
    ({ id: id(), type, attrs, content: spans(ctx), children: [] }) as Block;
  const list = (depth: number): Block => {
    const kind = pick(["bulletList", "orderedList", "todoList"]);
    const items: Block[] = [];
    const ni = int(1, 3);
    for (let i = 0; i < ni; i++) {
      if (kind === "todoList") items.push(rich("todoItem", { checked: rng() < 0.5 }, "block"));
      else {
        const it = rich("listItem", {}, "block");
        if (depth < 1 && rng() < 0.25) {
          const sub = list(depth + 1);
          if (sub.type !== "todoList") it.children.push(sub);
        }
        items.push(it);
      }
    }
    const attrs: Record<string, unknown> =
      kind === "orderedList"
        ? { start: int(0, 12), delimiter: pick([".", ")"]) }
        : { marker: pick(["-", "*", "+"]) };
    if (rng() < 0.2) attrs.spread = true;
    return { id: id(), type: kind, attrs, content: null, children: items };
  };
  const block = (): Block => {
    const r = rng();
    if (r < 0.25) return rich("paragraph", rng() < 0.3 ? { breaks: "hard" } : {}, "block");
    if (r < 0.37) return rich("heading", { level: int(1, 6) }, "heading");
    if (r < 0.57) return list(0);
    if (r < 0.7) {
      const cols = int(1, 3);
      const rows: Block[] = [];
      const nr = int(1, 3);
      for (let i = 0; i < nr; i++) {
        const cells: Block[] = [];
        for (let c = 0; c < cols; c++)
          cells.push(rich(i === 0 ? "tableHeader" : "tableCell", {}, "cell"));
        rows.push({ id: id(), type: "tableRow", attrs: {}, content: null, children: cells });
      }
      const align = Array.from({ length: cols }, () => pick([null, "left", "right", "center"]));
      return { id: id(), type: "table", attrs: { align }, content: null, children: rows };
    }
    if (r < 0.85) {
      const t = pick(["note", "tip", "important", "warning", "caution", "agent"]);
      return rich(
        "callout",
        t === "agent" ? { type: "agent" } : { type: t, alert: t.toUpperCase() },
        "block",
      );
    }
    return rich("blockquote", {}, "block");
  };
  const blocks: Block[] = [];
  const nb = int(1, 4);
  for (let i = 0; i < nb; i++) blocks.push(block());
  return { version: 1, blocks } satisfies Doc;
}

describe("property: parse(serialize(doc)) == doc", () => {
  it("holds for 400 generated documents (fixed seed)", () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const doc = generator(seed);
      const { text } = serializeMarkdown(doc);
      const back = parseMarkdown(text).doc;
      const expected = doc.blocks.map(fingerprint);
      const actual = back.blocks.map(fingerprint);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        failures.push(`seed ${seed}: ${JSON.stringify(text)}`);
      }
      // The serialized text itself is a fixed point of parse + serialize.
      const again = parseMarkdown(text);
      if (serializeMarkdown(again.doc, again.snapshot).text !== text) {
        failures.push(`seed ${seed}: not a fixed point`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("re-serializing a parsed document without snapshot is stable", () => {
    for (let seed = 1000; seed < 1100; seed++) {
      const first = serializeMarkdown(generator(seed)).text;
      const second = serializeMarkdown(parseMarkdown(first).doc).text;
      expect(parseMarkdown(second).doc.blocks.map(fingerprint)).toEqual(
        parseMarkdown(first).doc.blocks.map(fingerprint),
      );
    }
  });
});
