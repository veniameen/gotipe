import { cssColor } from "./inline-html";
import { hasMergedCells, tableHtml } from "./serialization/table-html";
import type { Block, Mark, RawSegment, Span } from "./types";

/**
 * Reads back the HTML table the writer gives a table with merged cells
 * (`serialization/table-html.ts`): a `<table>` with one `<tr>`, `<th>` or `<td>` per line, spans,
 * `text-align` and the writer's inline tags. Anything else stays raw HTML: the table read is
 * written again and must give the same bytes. The Rust reader
 * (`crates/gotipe-export/src/markdown_parse/table_html.rs`) reads the same.
 */

export interface ReadCell {
  type: "tableHeader" | "tableCell";
  attrs: Record<string, unknown>;
  spans: Span[];
  segs: RawSegment[];
  start: number;
  end: number;
}
export interface ReadRow {
  start: number;
  end: number;
  cells: ReadCell[];
}
export interface ReadTable {
  align: ("left" | "center" | "right" | null)[];
  rows: ReadRow[];
}

/** Marks from the outermost tag in: the order the writer nests them. */
const TAGS: Record<string, string> = {
  strong: "bold",
  em: "italic",
  u: "underline",
  s: "strikethrough",
  sup: "superscript",
  sub: "subscript",
  code: "code",
};
const RANK = [
  "link",
  "textColor",
  "highlight",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "superscript",
  "subscript",
  "code",
];
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"' };

function decode(raw: string): string | null {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    if (char === "&") {
      const end = raw.indexOf(";", i);
      const value = end > i ? ENTITIES[raw.slice(i + 1, end)] : undefined;
      if (value === undefined) return null;
      out += value;
      i = end;
    } else if (char === "<" || char === ">" || char === '"') return null;
    else out += char;
  }
  return out;
}

function openTag(tag: string): Mark | null {
  const plain = /^<(strong|em|u|s|sup|sub|code|mark)>$/.exec(tag);
  if (plain) return { type: plain[1] === "mark" ? "highlight" : TAGS[plain[1]!]! };
  const link = /^<a href="([^"]*)">$/.exec(tag);
  if (link) {
    const href = decode(link[1]!);
    return href ? { type: "link", attrs: { href } } : null;
  }
  const color = /^<(span|mark) style="(color|background-color):([^"]*)">$/.exec(tag);
  if (!color || (color[1] === "span") !== (color[2] === "color") || !cssColor(color[3]))
    return null;
  return { type: color[1] === "span" ? "textColor" : "highlight", attrs: { color: color[3]! } };
}

/** A cell's inline HTML: text with its marks, and where each run of text stands. */
function readInline(html: string, at: number): { spans: Span[]; segs: RawSegment[] } | null {
  const spans: Span[] = [];
  const segs: RawSegment[] = [];
  const stack: { name: string; mark: Mark }[] = [];
  let textAt = 0;
  let i = 0;
  while (i < html.length) {
    if (html.startsWith("</", i)) {
      const end = html.indexOf(">", i);
      const top = stack.pop();
      if (end < 0 || !top || html.slice(i + 2, end) !== top.name) return null;
      i = end + 1;
      continue;
    }
    if (html[i] === "<" && !html.startsWith("<br>", i)) {
      const end = html.indexOf(">", i);
      const mark = end < 0 ? null : openTag(html.slice(i, end + 1));
      if (!mark) return null;
      stack.push({ name: /^<([a-z]+)/.exec(html.slice(i))![1]!, mark });
      i = end + 1;
      continue;
    }
    // a run of text and line breaks up to the next tag
    let stop = i;
    while (stop < html.length && (html[stop] !== "<" || html.startsWith("<br>", stop)))
      stop += html.startsWith("<br>", stop) ? 4 : 1;
    const raw = html.slice(i, stop);
    const text = decode(raw.replaceAll("<br>", "\n"));
    if (text === null) return null;
    const marks = stack.map((entry) => entry.mark);
    marks.sort((a, b) => RANK.indexOf(a.type) - RANK.indexOf(b.type));
    const last = spans.at(-1);
    if (last && JSON.stringify(last.marks) === JSON.stringify(marks)) last.text += text;
    else spans.push({ text, marks });
    segs.push({
      textFrom: textAt,
      textTo: textAt + text.length,
      mdFrom: at + i,
      mdTo: at + stop,
      exact: raw === text,
    });
    textAt += text.length;
    i = stop;
  }
  return stack.length ? null : { spans, segs };
}

const CELL =
  /^<(th|td)((?: colspan="\d+")?(?: rowspan="\d+")?(?: style="text-align:(?:left|center|right)")?)>(.*)<\/\1>$/;

/** The writer's table in `source` (offsets from `base`), or null when it is not one. */
export function readHtmlTable(source: string, base: number): ReadTable | null {
  if (!source.startsWith("<table>\n") && !source.startsWith("<table>\r\n")) return null;
  const eol = source[7] === "\r" ? "\r\n" : "\n";
  const second = source.slice(7 + eol.length);
  const indent = /^[ \t]*/.exec(second)![0];
  const newline = eol + indent;
  const lines = source.split(newline);
  if (lines[0] !== "<table>" || lines.at(-1) !== "</table>") return null;
  const rows: ReadRow[] = [];
  const cells: { cell: ReadCell; style: string | null }[][] = [];
  let at = base;
  let row: ReadRow | null = null;
  for (const [index, line] of lines.entries()) {
    const start = at;
    at += line.length + newline.length;
    if (index === 0 || index === lines.length - 1) continue;
    if (line === "<tr>" && !row) {
      row = { start, end: start, cells: [] };
      cells.push([]);
      continue;
    }
    if (line === "</tr>" && row) {
      row.end = start + line.length;
      rows.push(row);
      row = null;
      continue;
    }
    const match = row ? CELL.exec(line) : null;
    if (!match || !row) return null;
    const attrs: Record<string, unknown> = {};
    const colspan = /colspan="(\d+)"/.exec(match[2]!);
    const rowspan = /rowspan="(\d+)"/.exec(match[2]!);
    if (colspan) attrs.colspan = Number(colspan[1]);
    if (rowspan) attrs.rowspan = Number(rowspan[1]);
    const open = 2 + match[1]!.length + match[2]!.length;
    const inline = readInline(match[3]!, start + open);
    if (!inline) return null;
    const cell: ReadCell = {
      type: match[1] === "th" ? "tableHeader" : "tableCell",
      attrs,
      spans: inline.spans,
      segs: inline.segs,
      start: start + open,
      end: start + open + match[3]!.length,
    };
    row.cells.push(cell);
    cells.at(-1)!.push({ cell, style: /text-align:([a-z]+)/.exec(match[2]!)?.[1] ?? null });
  }
  if (row || !rows.length) return null;
  const starts: number[][] = [];
  const occupied: number[] = [];
  let columns = 0;
  cells.forEach((list, y) => {
    let x = 0;
    starts.push(
      list.map(({ cell }) => {
        while ((occupied[x] ?? 0) > y) x++;
        const column = x;
        const span = Number(cell.attrs.colspan ?? 1);
        for (let c = x; c < x + span; c++) occupied[c] = y + Number(cell.attrs.rowspan ?? 1);
        x += span;
        columns = Math.max(columns, x);
        return column;
      }),
    );
  });
  // A column is aligned when every cell starting in it has a `text-align`: the most frequent
  // one (the first on a tie); a cell that differs keeps its own. A cell without one means the
  // column is not aligned, and every aligned cell in it keeps its own.
  const align: ReadTable["align"] = [];
  for (let x = 0; x < columns; x++) {
    const entries = cells.flatMap((list, y) => list.filter((_, i) => starts[y]![i] === x));
    let column: string | null = null;
    if (entries.length && entries.every((entry) => entry.style)) {
      const count = (style: string | null) => entries.filter((e) => e.style === style).length;
      for (const entry of entries)
        if (!column || count(entry.style) > count(column)) column = entry.style;
    }
    align.push(column as ReadTable["align"][number]);
    for (const entry of entries)
      if (entry.style && entry.style !== column) entry.cell.attrs.align = entry.style;
  }
  const table = { align, rows };
  const block = asBlock(table);
  // a table without merged cells is written as a pipe table: this HTML is someone else's
  return hasMergedCells(block) && tableHtml(block, newline).text === source ? table : null;
}

/** The table read as a block, ids left empty. */
export function asBlock(table: ReadTable): Block {
  return {
    id: "",
    type: "table",
    attrs: { align: table.align },
    content: null,
    children: table.rows.map((row) => ({
      id: "",
      type: "tableRow",
      attrs: {},
      content: null,
      children: row.cells.map((cell) => ({
        id: "",
        type: cell.type,
        attrs: cell.attrs,
        content: cell.spans,
        children: [],
      })),
    })),
  };
}
