import { cssColor } from "../inline-html";
import type { Block, Mark, RawSegment, Span } from "../types";

/**
 * Markdown has no syntax for merged cells, so a table with a `colspan`/`rowspan` above 1 is written
 * as an HTML `<table>` block instead of a pipe table: spans, cells and text survive, and readers
 * that show HTML draw it merged. Inline marks become HTML tags; a mark without a tag of its own
 * (a mention, a custom emoji, an unknown mark) keeps only its text, and text kept verbatim
 * (`mdRaw`) stands as text in a `<span>` of its own. Each cell is one line, so a blank line never
 * ends the HTML block early. The Rust writer
 * (`crates/gotipe-export/src/markdown/table_html.rs`) writes the same bytes.
 */

/**
 * `colspan`/`rowspan` by the rule the editor's grid, the HTML serializers, DOCX and PDF share: an
 * integer from 1 to 1000 — a number, or text that reads as one — else 1.
 */
export function cellSpan(cell: Block, name: "colspan" | "rowspan"): number {
  const stored = cell.attrs?.[name];
  const value =
    typeof stored === "number"
      ? stored
      : typeof stored === "string"
        ? Number(stored.trim() || "x")
        : Number.NaN;
  return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : 1;
}

export function hasMergedCells(table: Block): boolean {
  return (table.children ?? []).some((row) =>
    (row.children ?? []).some(
      (cell) => cellSpan(cell, "colspan") > 1 || cellSpan(cell, "rowspan") > 1,
    ),
  );
}

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `toSafeHref` of @gotipe/core: web and mail links and relative references only. */
function safeHref(href: string): string | null {
  const value = href.trim();
  if (!value) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: browsers ignore these in URL schemes
  const compact = value.replace(/[\u0000-\u001F\u007F\s]+/g, "");
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(compact);
  if (!scheme) return value;
  return ["http", "https", "mailto"].includes(scheme[1]!.toLowerCase()) ? value : null;
}

/** Tags from the innermost out; the order is fixed, not the order of a span's marks. */
const ORDER = [
  "code",
  "subscript",
  "superscript",
  "strikethrough",
  "underline",
  "italic",
  "bold",
  "highlight",
  "textColor",
  "link",
] as const;
const PLAIN: Record<string, string> = {
  code: "code",
  subscript: "sub",
  superscript: "sup",
  strikethrough: "s",
  underline: "u",
  italic: "em",
  bold: "strong",
};

function tags(marks: readonly Mark[]): { open: string; close: string } {
  let open = "";
  let close = "";
  for (const type of ORDER) {
    const mark = marks.find((item) => item.type === type);
    if (!mark) continue;
    let tag: string | null = PLAIN[type] ?? null;
    let attrs = "";
    if (type === "link") {
      const href = safeHref(String(mark.attrs?.href ?? ""));
      if (!href) continue;
      tag = "a";
      attrs = ` href="${escape(href)}"`;
    } else if (type === "textColor") {
      const color = cssColor(mark.attrs?.color);
      if (!color) continue;
      tag = "span";
      attrs = ` style="color:${color}"`;
    } else if (type === "highlight") {
      const color = cssColor(mark.attrs?.color);
      tag = "mark";
      attrs = color ? ` style="background-color:${color}"` : "";
    }
    if (!tag) continue;
    open = `<${tag}${attrs}>${open}`;
    close = `${close}</${tag}>`;
  }
  return { open, close };
}

/**
 * Writes one cell's text; returns its segments relative to the start of the written HTML. Text
 * kept verbatim (`mdRaw`) is Markdown, which HTML does not read: it is written as text inside a
 * `<span>` of its own and read back verbatim (D-103).
 */
function cellHtml(content: Block["content"]): { html: string; segs: RawSegment[] } {
  const spans: Span[] = Array.isArray(content) ? content : [];
  const segs: RawSegment[] = [];
  let html = "";
  let textAt = 0;
  let wrap: { open: string; close: string } | null = null;
  let verbatim = false;
  const endVerbatim = () => {
    if (verbatim) html += "</span>";
    verbatim = false;
  };
  const flush = () => {
    endVerbatim();
    if (wrap) html += wrap.close;
    wrap = null;
  };
  for (const span of spans) {
    if (!span || typeof span.text !== "string" || span.text.length === 0) continue;
    const marks = Array.isArray(span.marks) ? span.marks : [];
    const next = tags(marks);
    if (!wrap || wrap.open !== next.open) {
      flush();
      html += next.open;
      wrap = next;
    }
    if (!marks.some((mark) => mark.type === "mdRaw")) endVerbatim();
    else if (!verbatim) {
      html += "<span>";
      verbatim = true;
    }
    const pending = escape(span.text).replace(/\r\n|\r|\n/g, "<br>");
    segs.push({
      textFrom: textAt,
      textTo: textAt + span.text.length,
      mdFrom: html.length,
      mdTo: html.length + pending.length,
      exact: pending === span.text,
    });
    html += pending;
    textAt += span.text.length;
  }
  flush();
  return { html, segs };
}

export interface HtmlTableCell {
  id: string;
  type: string;
  /** Offsets of the cell's content inside the table's text. */
  start: number;
  end: number;
  segs: RawSegment[];
}
export interface HtmlTableRow {
  id: string;
  type: string;
  start: number;
  end: number;
  cells: HtmlTableCell[];
}

/** The table as HTML lines joined by `newline` (an EOL and the block's indentation). */
export function tableHtml(table: Block, newline: string): { text: string; rows: HtmlTableRow[] } {
  const align = Array.isArray(table.attrs?.align) ? table.attrs.align : [];
  const occupied: number[] = [];
  const rows: HtmlTableRow[] = [];
  let text = "<table>";
  (table.children ?? []).forEach((row, y) => {
    text += newline;
    const entry: HtmlTableRow = {
      id: row.id,
      type: row.type,
      start: text.length,
      end: 0,
      cells: [],
    };
    text += "<tr>";
    let x = 0;
    for (const cell of row.children ?? []) {
      while ((occupied[x] ?? 0) > y) x++;
      const columns = cellSpan(cell, "colspan");
      const rowsSpanned = cellSpan(cell, "rowspan");
      const own = cell.attrs?.align;
      const side = own === "left" || own === "center" || own === "right" ? own : align[x];
      const tag = cell.type === "tableHeader" ? "th" : "td";
      let attrs = "";
      if (columns > 1) attrs += ` colspan="${columns}"`;
      if (rowsSpanned > 1) attrs += ` rowspan="${rowsSpanned}"`;
      if (side === "left" || side === "center" || side === "right")
        attrs += ` style="text-align:${side}"`;
      text += `${newline}<${tag}${attrs}>`;
      const { html, segs } = cellHtml(cell.content);
      const start = text.length;
      text += html;
      entry.cells.push({ id: cell.id, type: cell.type, start, end: text.length, segs });
      text += `</${tag}>`;
      for (let column = x; column < x + columns; column++) occupied[column] = y + rowsSpanned;
      x += columns;
    }
    text += `${newline}</tr>`;
    entry.end = text.length;
    rows.push(entry);
  });
  return { text: `${text}${newline}</table>`, rows };
}
