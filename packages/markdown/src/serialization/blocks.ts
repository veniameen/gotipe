import { type InlineOptions, linkDestination, linkTitle, writeInline } from "../inline-serialize";
import { calloutKind, clampLevel, listStart, normalizeAlign, richContent } from "../model";
import type { Block, RawSegment, Span } from "../types";
import { normalizeEol } from "../util";

/** Rendered block tree (offsets relative to the top-level block start). */
export interface RNode {
  id: string;
  type: string;
  start: number;
  end: number;
  segs: RawSegment[];
  children: RNode[];
}

export interface RenderOpts {
  eol: string;
  tier: number;
  /** Write a divider as `***` (first block of a file without front matter). */
  dividerAlt?: boolean;
  /** Marker (bullet char or ordered delimiter) to use for a top-level list. */
  markerOverride?: string;
}

class Writer {
  s = "";
  write(x: string): void {
    this.s += x;
  }
  get pos(): number {
    return this.s.length;
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
}

function inline(
  w: Writer,
  spans: Span[],
  o: Omit<InlineOptions, "tier" | "eol">,
  ro: RenderOpts,
): RawSegment[] {
  const r = writeInline(spans, { ...o, eol: ro.eol, tier: ro.tier });
  const at = w.pos;
  w.write(r.md);
  return r.segs.map((s) => ({ ...s, mdFrom: s.mdFrom + at, mdTo: s.mdTo + at }));
}

const ENTITY_GLOBAL = /&(?=(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});)/g;

function infoString(language: string, meta: string): string {
  const info = (meta ? `${language} ${meta}` : language).replace(/\r\n?|\n/g, " ");
  return info.replace(/\\(?=[!-/:-@[-`{-~])/g, "\\\\").replace(ENTITY_GLOBAL, "\\&");
}

function longestRun(s: string, ch: string): number {
  let best = 0;
  let cur = 0;
  for (const c of s) {
    if (c === ch) {
      cur++;
      if (cur > best) best = cur;
    } else cur = 0;
  }
  return best;
}

function plainAlt(text: string, ro: RenderOpts): string {
  return writeInline([{ text, marks: [] }], {
    kind: "alt",
    eol: ro.eol,
    newline: " ",
    hard: false,
    tier: 2,
  }).md;
}

export function bulletMarker(attrs: Record<string, unknown>, override?: string): string {
  const m = override ?? attrs.marker;
  return m === "*" || m === "+" || m === "-" ? m : "-";
}

/** Ordered lists not starting at 1 and lists starting with an empty item cannot interrupt a paragraph. */
function cannotInterrupt(list: Block): boolean {
  if (list.type === "orderedList" && listStart(list.attrs?.start) !== 1) return true;
  if (list.type === "bulletList" || list.type === "orderedList" || list.type === "todoList") {
    const first = list.children?.[0];
    return !first || (richContent(first).length === 0 && list.type !== "todoList");
  }
  return false;
}

function renderList(w: Writer, block: Block, indent: string, ro: RenderOpts, node: RNode): void {
  const attrs = block.attrs ?? {};
  const items = block.children ?? [];
  const spread = attrs.spread === true;
  const ordered = block.type === "orderedList";
  const todo = block.type === "todoList";
  const start = listStart(attrs.start);
  const delim = (ro.markerOverride ?? attrs.delimiter) === ")" ? ")" : ".";
  const bullet = bulletMarker(attrs, ro.markerOverride);
  const inner: RenderOpts = { ...ro, markerOverride: undefined };
  items.forEach((item, idx) => {
    if (idx > 0) {
      w.write(ro.eol);
      if (spread) w.write(ro.eol);
      w.write(indent);
    }
    const itemNode: RNode = {
      id: item.id,
      type: item.type,
      start: w.pos,
      end: w.pos,
      segs: [],
      children: [],
    };
    const marker = ordered ? `${start + idx}${delim}` : bullet;
    w.write(marker);
    const contIndent = indent + " ".repeat(marker.length + 1);
    const spans = richContent(item);
    const hard = item.attrs?.breaks === "hard";
    if (todo) {
      w.write(item.attrs?.checked === true ? " [x]" : " [ ]");
      if (spans.length > 0) {
        w.write(" ");
        itemNode.segs = inline(
          w,
          spans,
          { kind: "midline", newline: ro.eol + contIndent, hard },
          inner,
        );
      }
    } else {
      if (spans.length > 0) {
        w.write(" ");
        itemNode.segs = inline(
          w,
          spans,
          { kind: "block", newline: ro.eol + contIndent, hard },
          inner,
        );
      }
    }
    for (const child of item.children ?? []) {
      w.write(ro.eol);
      if (spread || (spans.length > 0 && cannotInterrupt(child))) w.write(ro.eol);
      w.write(contIndent);
      itemNode.children.push(renderBlock(w, child, contIndent, inner));
    }
    itemNode.end = w.pos;
    node.children.push(itemNode);
  });
}

function renderTable(w: Writer, block: Block, indent: string, ro: RenderOpts, node: RNode): void {
  const rows = block.children ?? [];
  const cols = Math.max(1, rows[0]?.children?.length ?? 0);
  const align = Array.isArray(block.attrs?.align) ? block.attrs.align : [];
  const writeRow = (row: Block): void => {
    const rowNode: RNode = {
      id: row.id,
      type: row.type,
      start: w.pos,
      end: w.pos,
      segs: [],
      children: [],
    };
    w.write("|");
    const cells = row.children ?? [];
    if (cells.length === 0) w.write(" |");
    for (const cell of cells) {
      w.write(" ");
      const cellNode: RNode = {
        id: cell.id,
        type: cell.type,
        start: w.pos,
        end: w.pos,
        segs: [],
        children: [],
      };
      cellNode.segs = inline(w, richContent(cell), { kind: "cell", newline: " ", hard: false }, ro);
      cellNode.end = w.pos;
      rowNode.children.push(cellNode);
      w.write(" |");
    }
    rowNode.end = w.pos;
    node.children.push(rowNode);
  };
  rows.forEach((row, idx) => {
    if (idx > 0) w.write(ro.eol + indent);
    writeRow(row);
    if (idx === 0) {
      w.write(ro.eol + indent);
      let line = "|";
      for (let c = 0; c < cols; c++) {
        const a = normalizeAlign(align[c]);
        const d = a === "left" ? ":---" : a === "right" ? "---:" : a === "center" ? ":---:" : "---";
        line += ` ${d} |`;
      }
      w.write(line);
    }
  });
}

function renderBlock(w: Writer, block: Block, indent: string, ro: RenderOpts): RNode {
  const node: RNode = {
    id: block.id,
    type: block.type,
    start: w.pos,
    end: w.pos,
    segs: [],
    children: [],
  };
  const attrs = block.attrs ?? {};
  const spans = Array.isArray(block.content) ? richContent(block) : [];
  const hard = attrs.breaks === "hard";
  switch (block.type) {
    case "paragraph":
      node.segs = inline(w, spans, { kind: "block", newline: ro.eol + indent, hard }, ro);
      break;
    case "heading":
      w.write("#".repeat(clampLevel(attrs.level)));
      if (spans.length > 0) {
        w.write(" ");
        node.segs = inline(w, spans, { kind: "heading", newline: " ", hard: false }, ro);
      }
      break;
    case "blockquote":
      if (spans.length === 0) w.write(">");
      else {
        w.write("> ");
        node.segs = inline(w, spans, { kind: "block", newline: `${ro.eol + indent}> `, hard }, ro);
      }
      break;
    case "callout": {
      const newline = `${ro.eol + indent}> `;
      w.write(`> [!${calloutKind(attrs)}]`);
      if (spans.length > 0) {
        w.write(newline);
        node.segs = inline(w, spans, { kind: "block", newline, hard, continuation: true }, ro);
      }
      break;
    }
    case "codeBlock": {
      const content = normalizeEol(
        typeof block.content === "string" ? block.content : spans.map((s) => s.text).join(""),
      );
      const info = infoString(str(attrs.language), str(attrs.meta));
      const fc = info.includes("`") ? "~" : "`";
      const fence = fc.repeat(Math.max(3, longestRun(content, fc) + 1));
      w.write(fence + info);
      if (content.length > 0) {
        const lines = content.split("\n");
        let ti = 0;
        lines.forEach((line, idx) => {
          const at = w.pos;
          w.write(ro.eol + indent);
          if (idx > 0) {
            node.segs.push({
              textFrom: ti - 1,
              textTo: ti,
              mdFrom: at,
              mdTo: at + ro.eol.length,
              exact: ro.eol === "\n",
            });
          }
          if (line.length > 0) {
            node.segs.push({
              textFrom: ti,
              textTo: ti + line.length,
              mdFrom: w.pos,
              mdTo: w.pos + line.length,
              exact: true,
            });
          }
          w.write(line);
          ti += line.length + 1;
        });
      }
      w.write(ro.eol + indent + fence);
      break;
    }
    case "divider":
      w.write(ro.dividerAlt ? "***" : "---");
      break;
    case "image": {
      const caption = str(attrs.caption);
      w.write(
        `![${plainAlt(str(attrs.alt), ro)}](${linkDestination(str(attrs.src))}${
          caption ? ` ${linkTitle(caption)}` : ""
        })`,
      );
      break;
    }
    case "file":
      w.write(`[${plainAlt(str(attrs.name), ro)}](${linkDestination(str(attrs.url))})`);
      break;
    case "table":
      renderTable(w, block, indent, ro, node);
      break;
    case "bulletList":
    case "orderedList":
    case "todoList":
      renderList(w, block, indent, ro, node);
      break;
    case "markdownRaw":
      w.write(typeof block.content === "string" ? block.content : "");
      break;
    default: {
      if (typeof block.content === "string") w.write(block.content);
      else if (Array.isArray(block.content)) {
        node.segs = inline(w, spans, { kind: "block", newline: ro.eol + indent, hard }, ro);
      }
    }
  }
  if (!["bulletList", "orderedList", "todoList", "table"].includes(block.type)) {
    const quoted = block.type === "blockquote" || block.type === "callout";
    const childIndent = quoted ? `${indent}> ` : indent;
    for (const child of block.children ?? []) {
      if (w.pos > node.start) w.write(ro.eol + (quoted ? `${indent}>` : "") + ro.eol + childIndent);
      node.children.push(renderBlock(w, child, childIndent, ro));
    }
  }
  node.end = w.pos;
  return node;
}

export function renderTop(block: Block, ro: RenderOpts): { md: string; node: RNode } {
  const w = new Writer();
  const node = renderBlock(w, block, "", ro);
  return { md: w.s, node };
}
