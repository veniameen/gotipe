import { describe, expect, it } from "vitest";
import { clone, flatText, plain } from "./__fixtures__/helpers";
import { WIKI_PAGE } from "./__fixtures__/wiki-page";
import {
  mdOffsetToText,
  parseMarkdown,
  serializeMarkdown,
  textOffsetToMd,
  textRangeToMd,
} from "./index";
import type { Block, Doc, MarkdownMap } from "./types";

function allBlocks(doc: Doc): Block[] {
  const out: Block[] = [];
  const walk = (b: Block) => {
    out.push(b);
    b.children.forEach(walk);
  };
  doc.blocks.forEach(walk);
  return out;
}

/** Every exact segment maps equal strings; every text char is covered exactly once. */
function checkMap(doc: Doc, text: string, map: MarkdownMap): void {
  const texts = new Map(allBlocks(doc).map((b) => [b.id, flatText(b)]));
  const covered = new Map<string, number>();
  for (const s of map.segments) {
    const t = texts.get(s.blockId);
    expect(t, `segment for unknown block ${s.blockId}`).toBeDefined();
    if (s.exact) expect(text.slice(s.mdFrom, s.mdTo)).toBe(t!.slice(s.textFrom, s.textTo));
    covered.set(s.blockId, (covered.get(s.blockId) ?? 0) + (s.textTo - s.textFrom));
  }
  for (const [id, t] of texts) expect(covered.get(id) ?? 0).toBe(t.length);
  for (let i = 1; i < map.segments.length; i++) {
    expect(map.segments[i]!.mdFrom).toBeGreaterThanOrEqual(map.segments[i - 1]!.mdFrom);
  }
}

describe("markdown <-> text mapping", () => {
  it("puts a selection's edges inside a mark's delimiters (bias, textRangeToMd)", () => {
    const md = "# Т\n\nЭто **жирный** и _наклонный_ текст\n";
    const { doc, snapshot } = parseMarkdown(md);
    const { text, map } = serializeMarkdown(doc, snapshot);
    const p = doc.blocks[1]!;
    expect(flatText(p)).toBe("Это жирный и наклонный текст");
    const word = (w: string) => {
      const from = flatText(p).indexOf(w);
      return [from, from + w.length] as const;
    };
    const [b0, b1] = word("жирный");
    // the end of "жирный": past the closing `**` by default (as before), before it with "before"
    expect(textOffsetToMd(map, p.id, b1)).toBe(md.indexOf(" и _"));
    expect(textOffsetToMd(map, p.id, b1, "after")).toBe(md.indexOf(" и _"));
    expect(textOffsetToMd(map, p.id, b1, "before")).toBe(md.indexOf("** и"));
    // its start: past the opening `**` either way
    expect(textOffsetToMd(map, p.id, b0, "before")).toBe(md.indexOf("жирный") - 2);
    expect(textOffsetToMd(map, p.id, b0)).toBe(md.indexOf("жирный"));
    const range = textRangeToMd(map, { blockId: p.id, offset: b0 }, { blockId: p.id, offset: b1 })!;
    expect(text.slice(range.start, range.end)).toBe("жирный");
    const [i0, i1] = word("наклонный");
    const italic = textRangeToMd(
      map,
      { blockId: p.id, offset: i0 },
      { blockId: p.id, offset: i1 },
    )!;
    expect(text.slice(italic.start, italic.end)).toBe("наклонный");
    // across the marks, the delimiters inside stay
    const across = textRangeToMd(
      map,
      { blockId: p.id, offset: b0 },
      { blockId: p.id, offset: i1 },
    )!;
    expect(text.slice(across.start, across.end)).toBe("жирный** и _наклонный");
    // a collapsed range at a mark's edge stays collapsed, past the delimiters
    const caret = textRangeToMd(map, { blockId: p.id, offset: b1 }, { blockId: p.id, offset: b1 })!;
    expect(caret.end).toBe(caret.start);
    // across blocks
    const title = doc.blocks[0]!;
    const both = textRangeToMd(
      map,
      { blockId: title.id, offset: 0 },
      { blockId: p.id, offset: b1 },
    )!;
    expect(text.slice(both.start, both.end)).toBe("Т\n\nЭто **жирный");
  });
  it("maps Cyrillic text, escapes and entities in a preserved paragraph", () => {
    const md = "# Т\n\nПривет, **мир** \\* и &amp; конец\n";
    const { doc, snapshot } = parseMarkdown(md);
    const { map } = serializeMarkdown(doc, snapshot);
    const p = doc.blocks[1]!;
    expect(flatText(p)).toBe("Привет, мир * и & конец");
    // "м" of "мир"
    const mdM = md.indexOf("мир");
    expect(mdOffsetToText(map, mdM)).toEqual({ blockId: p.id, offset: 8 });
    expect(textOffsetToMd(map, p.id, 8)).toBe(mdM);
    // escaped "*" (text offset 12) maps to the backslash
    expect(textOffsetToMd(map, p.id, 12)).toBe(md.indexOf("\\*"));
    expect(textOffsetToMd(map, p.id, 13)).toBe(md.indexOf("\\*") + 2);
    const esc = map.segments.find((s) => s.blockId === p.id && s.textFrom === 12)!;
    expect(esc).toMatchObject({ textTo: 13, mdTo: md.indexOf("\\*") + 2, exact: false });
    // entity "&amp;" -> "&"
    const amp = md.indexOf("&amp;");
    expect(textOffsetToMd(map, p.id, 16)).toBe(amp);
    expect(mdOffsetToText(map, amp + 2, "before")).toEqual({ blockId: p.id, offset: 16 });
    expect(mdOffsetToText(map, amp + 2, "after")).toEqual({ blockId: p.id, offset: 17 });
    // inside the `**` delimiters: snaps to neighbouring text
    const delim = md.indexOf("**") + 1;
    expect(mdOffsetToText(map, delim, "before")).toEqual({ blockId: p.id, offset: 8 });
    // heading
    expect(mdOffsetToText(map, 2)).toEqual({ blockId: doc.blocks[0]!.id, offset: 0 });
    checkMap(doc, md, map);
  });

  it("maps soft breaks inside blockquotes and list items", () => {
    const md = "> первая\n> вторая\n\n- пункт\n  продолжение\n";
    const { doc, snapshot } = parseMarkdown(md);
    const { map } = serializeMarkdown(doc, snapshot);
    const quote = doc.blocks[0]!;
    expect(flatText(quote)).toBe("первая вторая");
    expect(textOffsetToMd(map, quote.id, 7)).toBe(md.indexOf("вторая"));
    expect(mdOffsetToText(map, md.indexOf("вторая") + 2)).toEqual({ blockId: quote.id, offset: 9 });
    const item = doc.blocks[1]!.children[0]!;
    expect(textOffsetToMd(map, item.id, 5)).toBe(md.indexOf("\n  продолжение"));
    expect(textOffsetToMd(map, item.id, 6)).toBe(md.indexOf("продолжение"));
    checkMap(doc, md, map);
  });

  it("maps code blocks line by line and inline code in table cells", () => {
    const md = "```js\nconst a = 1;\nconst б = 2;\n```\n\n| `a\\|b` |\n| --- |\n";
    const { doc, snapshot } = parseMarkdown(md);
    const { map } = serializeMarkdown(doc, snapshot);
    const code = doc.blocks[0]!;
    expect(textOffsetToMd(map, code.id, 13)).toBe(md.indexOf("const б"));
    const cell = doc.blocks[1]!.children[0]!.children[0]!;
    expect(flatText(cell)).toBe("a|b");
    expect(textOffsetToMd(map, cell.id, 1)).toBe(md.indexOf("\\|"));
    expect(textOffsetToMd(map, cell.id, 2)).toBe(md.indexOf("\\|") + 2);
    checkMap(doc, md, map);
  });

  it("lists every block, including nested ones, with depth", () => {
    const { doc, snapshot } = parseMarkdown(WIKI_PAGE);
    const { map } = serializeMarkdown(doc, snapshot);
    expect(map.blocks.map((b) => b.blockId)).toEqual(allBlocks(doc).map((b) => b.id));
    const table = doc.blocks[9]!;
    const entry = map.blocks.find((b) => b.blockId === table.id)!;
    expect(WIKI_PAGE.slice(entry.start, entry.end).startsWith("| Компонент")).toBe(true);
    const cell = table.children[1]!.children[0]!;
    const cellEntry = map.blocks.find((b) => b.blockId === cell.id)!;
    expect(cellEntry.depth).toBe(2);
    checkMap(doc, WIKI_PAGE, map);
  });

  it("produces a consistent map for re-serialized blocks", () => {
    const { doc: parsed, snapshot } = parseMarkdown(WIKI_PAGE);
    const doc = clone(parsed);
    doc.blocks[3]!.content = [
      { text: "Новый ", marks: [] },
      { text: "*текст*", marks: [{ type: "bold" }] },
      { text: " & [скобки]\nвторая строка", marks: [] },
    ];
    doc.blocks[9]!.children[2]!.children[0]!.content = plain("Редактор | v2");
    const { text, map } = serializeMarkdown(doc, snapshot);
    checkMap(doc, text, map);
    const p = doc.blocks[3]!;
    const star = textOffsetToMd(map, p.id, 6)!;
    expect(text.slice(star, star + 2)).toBe("\\*");
    const second = textOffsetToMd(map, p.id, flatText(p).indexOf("вторая"))!;
    expect(text.slice(second, second + 6)).toBe("вторая");
  });
});
