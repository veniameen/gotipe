import { alignCodeBlock } from "./align";
import { readMarkdown } from "./grammar/blocks";
import type {
  Blockquote,
  Code,
  Heading,
  Link,
  List,
  ListItem,
  Nodes,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
} from "./grammar/types";
import { assignIds, prevFromDoc, prevFromSnapshot } from "./ids";
import {
  type InlineParseCtx,
  type InlineResult,
  parseInline,
  trimInlineStart,
} from "./inline-parse";
import { fingerprint, normalizeAlign } from "./model";
import type {
  Block,
  ParseOptions,
  ParseResult,
  RawSegment,
  SnapshotBlock,
  SnapshotNode,
  Span,
  TextSegment,
} from "./types";
import { detectEol, detectFrontMatter, normalizeEol, uuidv7 } from "./util";

/** Internal parse tree: a block with its absolute source range and segments. */
export interface PNode {
  block: Block;
  start: number;
  end: number;
  /** Segments of this block's own text (md offsets absolute). */
  segs: RawSegment[];
  children: PNode[];
}

export interface ParsedInternal {
  text: string;
  bom: string;
  frontMatter: string;
  base: number;
  eol: string;
  nodes: PNode[];
}

const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i;

function mk(
  type: string,
  attrs: Record<string, unknown>,
  content: Span[] | string | null,
  start: number,
  end: number,
  segs: RawSegment[] = [],
  children: PNode[] = [],
): PNode {
  return {
    block: { id: "", type, attrs, content, children: children.map((c) => c.block) },
    start,
    end,
    segs,
    children,
  };
}

function breaksAttr(r: InlineResult): Record<string, unknown> {
  let hard = false;
  let soft = false;
  for (const n of r.newlines) {
    if (n.hard) hard = true;
    else soft = true;
  }
  return hard && !soft ? { breaks: "hard" } : {};
}

class Converter {
  readonly ctx: InlineParseCtx;

  constructor(
    readonly text: string,
    readonly base: number,
    segments: boolean,
  ) {
    this.ctx = { src: text, base, segments };
  }

  start(node: Nodes): number | null {
    const o = node.position?.start.offset;
    return typeof o === "number" ? o + this.base : null;
  }

  end(node: Nodes): number | null {
    const o = node.position?.end.offset;
    return typeof o === "number" ? o + this.base : null;
  }

  inline(
    children: PhrasingContent[],
    from: number,
    to: number,
    cell = false,
    br = false,
  ): InlineResult {
    return parseInline(children, this.ctx, { brNewline: br || cell, inCell: cell }, from, to);
  }

  raw(kind: string, s: number, e: number): PNode {
    const content = this.text.slice(s, e);
    const segs: RawSegment[] = this.ctx.segments
      ? [{ textFrom: 0, textTo: content.length, mdFrom: s, mdTo: e, exact: true }]
      : [];
    return mk("markdownRaw", { kind }, content, s, e, segs);
  }

  top(node: RootContent, s: number, e: number): PNode {
    switch (node.type) {
      case "paragraph":
        return this.paragraph(node, s, e);
      case "heading":
        return this.heading(node, s, e);
      case "thematicBreak":
        return mk("divider", {}, null, s, e);
      case "code":
        return node.lang === "math" && node.meta == null
          ? this.math(node.value, s, e)
          : this.code(node, s, e);
      case "math":
        return this.math(node.value, s, e);
      case "blockquote":
        return this.blockquote(node, s, e) ?? this.raw(node.type, s, e);
      case "list":
        return this.list(node, s, e) ?? this.raw(node.type, s, e);
      case "table":
        return this.table(node, s, e);
      default:
        return this.raw(node.type, s, e);
    }
  }

  paragraph(node: Paragraph, s: number, e: number): PNode {
    const only = node.children.length === 1 ? node.children[0] : undefined;
    if (only?.type === "image") {
      return mk(
        "image",
        { src: only.url, alt: only.alt ?? "", caption: only.title ?? "" },
        null,
        s,
        e,
      );
    }
    if (only?.type === "link") {
      const name = fileLinkName(only);
      if (name !== null) return mk("file", { url: only.url, name }, null, s, e);
    }
    const r = this.inline(node.children, s, e);
    return mk("paragraph", breaksAttr(r), r.spans, s, e, r.segs);
  }

  heading(node: Heading, s: number, e: number): PNode {
    const r = this.inline(node.children, s, e, false, true);
    return mk("heading", { level: node.depth }, r.spans, s, e, r.segs);
  }

  code(node: Code, s: number, e: number): PNode {
    const value = normalizeEol(node.value);
    const attrs: Record<string, unknown> = { language: node.lang ?? "" };
    if (typeof node.meta === "string") attrs.meta = node.meta;
    let segs: RawSegment[] = [];
    if (this.ctx.segments) {
      const fenced = /^[ \t]*(?:`{3,}|~{3,})/.test(this.text.slice(s, Math.min(e, s + 80)));
      segs = alignCodeBlock(value, this.text, s, e, fenced) ?? [
        { textFrom: 0, textTo: value.length, mdFrom: s, mdTo: e, exact: false },
      ];
    }
    return mk("codeBlock", attrs, value, s, e, segs);
  }

  /** A `$$` block or a ```` ```math ```` fence; the editor's formula block. */
  math(source: string, s: number, e: number): PNode {
    const value = normalizeEol(source);
    let segs: RawSegment[] = [];
    if (this.ctx.segments) {
      segs = alignCodeBlock(value, this.text, s, e, true) ?? [
        { textFrom: 0, textTo: value.length, mdFrom: s, mdTo: e, exact: false },
      ];
    }
    return mk("math", { display: "block" }, value, s, e, segs);
  }

  blockquote(node: Blockquote, s: number, e: number): PNode | null {
    const para = node.children.length === 1 ? node.children[0] : undefined;
    if (para?.type !== "paragraph") return null;
    const ps = this.start(para) ?? s;
    const pe = this.end(para) ?? e;
    const r = this.inline(para.children, ps, pe);
    const first = para.children[0];
    if (first?.type === "text") {
      const fs = this.start(first);
      const m = ALERT_RE.exec(r.text);
      const head = r.spans[0];
      if (
        m &&
        fs !== null &&
        this.text.startsWith("[!", fs) &&
        head &&
        head.marks.length === 0 &&
        head.text.length >= m[0].length
      ) {
        const t = trimInlineStart(r, m[0].length);
        const alert = m[1]!.toUpperCase();
        return mk(
          "callout",
          { type: alert.toLowerCase(), alert, ...breaksAttr(t) },
          t.spans,
          s,
          e,
          t.segs,
        );
      }
    }
    return mk("blockquote", breaksAttr(r), r.spans, s, e, r.segs);
  }

  taskState(item: ListItem): boolean | null {
    if (typeof item.checked === "boolean") return item.checked;
    const p = item.children.length === 1 ? item.children[0] : undefined;
    if (p?.type === "paragraph" && p.children.length === 1 && p.children[0]!.type === "text") {
      const t = p.children[0]!;
      const ts = this.start(t);
      const te = this.end(t);
      if (ts !== null && te !== null) {
        const src = this.text.slice(ts, te);
        if (src === "[ ]") return false;
        if (src === "[x]" || src === "[X]") return true;
      }
    }
    return null;
  }

  /** The lists nested in an item after its first `from` children; null when anything else is. */
  nestedLists(item: ListItem, from: number): PNode[] | null {
    const nested: PNode[] = [];
    for (let idx = from; idx < item.children.length; idx++) {
      const c = item.children[idx]!;
      if (c.type !== "list") return null;
      const cs = this.start(c);
      const ce = this.end(c);
      if (cs === null || ce === null) return null;
      const cn = this.list(c, cs, ce);
      if (!cn) return null;
      nested.push(cn);
    }
    return nested;
  }

  list(node: List, s: number, e: number): PNode | null {
    const items = node.children;
    if (items.length === 0) return null;
    const states = items.map((it) => this.taskState(it));
    const allTask = states.every((x) => x !== null);
    const noTask = states.every((x) => x === null);
    if (!allTask && !noTask) return null;
    const spread = node.spread === true || items.some((i) => i.spread === true);
    const firstStart = this.start(items[0]!) ?? s;
    const kids: PNode[] = [];
    if (allTask) {
      if (node.ordered) return null;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const is = this.start(item) ?? s;
        const ie = this.end(item) ?? e;
        if (typeof item.checked !== "boolean") {
          kids.push(mk("todoItem", { checked: states[i] === true }, [], is, ie));
          continue;
        }
        // a task is one paragraph, then the lists nested under it (sub-tasks or plain items)
        const p = item.children[0];
        if (p?.type !== "paragraph") return null;
        const nested = this.nestedLists(item, 1);
        if (!nested) return null;
        const r = this.inline(p.children, this.start(p) ?? is, this.end(p) ?? ie);
        kids.push(
          mk(
            "todoItem",
            { checked: item.checked, ...breaksAttr(r) },
            r.spans,
            is,
            ie,
            r.segs,
            nested,
          ),
        );
      }
      const attrs: Record<string, unknown> = { spread };
      const marker = this.text[firstStart];
      if (marker === "-" || marker === "*" || marker === "+") attrs.marker = marker;
      return mk("todoList", attrs, null, s, e, [], kids);
    }
    for (const item of items) {
      const is = this.start(item) ?? s;
      const ie = this.end(item) ?? e;
      let content: Span[] = [];
      let segs: RawSegment[] = [];
      let attrs: Record<string, unknown> = {};
      let idx = 0;
      const first = item.children[0];
      if (first?.type === "paragraph") {
        const r = this.inline(first.children, this.start(first) ?? is, this.end(first) ?? ie);
        content = r.spans;
        segs = r.segs;
        attrs = breaksAttr(r);
        idx = 1;
      }
      const nested = this.nestedLists(item, idx);
      if (!nested) return null;
      kids.push(mk("listItem", attrs, content, is, ie, segs, nested));
    }
    if (node.ordered) {
      let p = firstStart;
      while (p < e && this.text.charCodeAt(p) >= 48 && this.text.charCodeAt(p) <= 57) p++;
      const attrs: Record<string, unknown> = { start: node.start ?? 1 };
      const d = this.text[p];
      if (d === "." || d === ")") attrs.delimiter = d;
      attrs.spread = spread;
      return mk("orderedList", attrs, null, s, e, [], kids);
    }
    const attrs: Record<string, unknown> = {};
    const marker = this.text[firstStart];
    if (marker === "-" || marker === "*" || marker === "+") attrs.marker = marker;
    attrs.spread = spread;
    return mk("bulletList", attrs, null, s, e, [], kids);
  }

  table(node: Table, s: number, e: number): PNode {
    const align = (node.align ?? []).map((a) => normalizeAlign(a));
    const rows = node.children.map((row, ri) => {
      const rs = this.start(row) ?? s;
      const re = this.end(row) ?? e;
      const cells = row.children.map((cell) => {
        const cs = this.start(cell) ?? rs;
        const ce = this.end(cell) ?? re;
        const r = this.inline(cell.children, cs, ce, true);
        return mk(ri === 0 ? "tableHeader" : "tableCell", {}, r.spans, cs, ce, r.segs);
      });
      return mk("tableRow", {}, null, rs, re, [], cells);
    });
    return mk("table", { align }, null, s, e, [], rows);
  }
}

function isRelativeHref(url: string): boolean {
  return (
    url !== "" &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(url) &&
    !url.startsWith("#") &&
    !url.startsWith("//")
  );
}

/** Decoded basename of a relative href (query/fragment stripped). */
export function hrefBasename(url: string): string {
  const path = url.replace(/[?#].*$/s, "");
  const base = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

function fileLinkName(link: Link): string | null {
  if (typeof link.title === "string" && link.title !== "") return null;
  if (!isRelativeHref(link.url)) return null;
  if (link.children.length !== 1 || link.children[0]!.type !== "text") return null;
  const name = link.children[0]!.value;
  if (name === "" || name !== hrefBasename(link.url)) return null;
  return name;
}

const CONTENT_RE = /[^ \t\r\n]/;

export function parseInternal(text: string, segments: boolean): ParsedInternal {
  const bom = text.charCodeAt(0) === 0xfeff ? "﻿" : "";
  const fmEnd = detectFrontMatter(text, bom.length);
  const frontMatter = text.slice(bom.length, fmEnd);
  const base = fmEnd;
  const conv = new Converter(text, base, segments);
  const root = readMarkdown(text.slice(base));
  const nodes: PNode[] = [];
  let cursor = base;
  const gapRaw = (a: number, b: number): void => {
    const g = text.slice(a, b);
    const first = g.search(CONTENT_RE);
    if (first === -1) return;
    let last = g.length;
    while (last > first && !CONTENT_RE.test(g[last - 1]!)) last--;
    nodes.push(conv.raw("unknown", a + first, a + last));
  };
  for (const child of root.children) {
    const cs = conv.start(child);
    const ce = conv.end(child);
    if (cs === null || ce === null || cs < cursor || ce < cs) continue;
    gapRaw(cursor, cs);
    nodes.push(conv.top(child, cs, ce));
    cursor = ce;
  }
  gapRaw(cursor, text.length);
  return { text, bom, frontMatter, base, eol: detectEol(text), nodes };
}

export function toSnapshotNode(n: PNode, origin: number): SnapshotNode {
  return {
    id: n.block.id,
    type: n.block.type,
    start: n.start - origin,
    end: n.end - origin,
    children: n.children.map((c) => toSnapshotNode(c, origin)),
  };
}

export function collectSegments(n: PNode, origin: number, out: TextSegment[]): TextSegment[] {
  for (const s of n.segs) {
    out.push({
      blockId: n.block.id,
      textFrom: s.textFrom,
      textTo: s.textTo,
      mdFrom: s.mdFrom - origin,
      mdTo: s.mdTo - origin,
      exact: s.exact,
    });
  }
  for (const c of n.children) collectSegments(c, origin, out);
  return out;
}

/**
 * Parse Markdown into a GoTipe document plus a snapshot that lets
 * `serializeMarkdown` re-emit untouched blocks byte-for-byte.
 */
export function parseMarkdown(text: string, options: ParseOptions = {}): ParseResult {
  const src = typeof text === "string" ? text : String(text ?? "");
  const p = parseInternal(src, true);
  const createId = options.createId ?? uuidv7;
  if (options.previous) {
    const prev = options.previous;
    assignIds(p.nodes, prevFromSnapshot(prev), (n) => src.slice(n.start, n.end), createId);
  } else if (options.previousDoc) {
    assignIds(p.nodes, prevFromDoc(options.previousDoc), (n) => fingerprint(n.block), createId);
  } else {
    assignIds(p.nodes, null, () => "", createId);
  }
  const blocks: SnapshotBlock[] = p.nodes.map((n) => ({
    id: n.block.id,
    type: n.block.type,
    start: n.start,
    end: n.end,
    fingerprint: fingerprint(n.block),
    tree: toSnapshotNode(n, n.start),
    segments: collectSegments(n, n.start, []),
  }));
  const gaps: string[] = [];
  for (let i = 0; i + 1 < p.nodes.length; i++) {
    gaps.push(src.slice(p.nodes[i]!.end, p.nodes[i + 1]!.start));
  }
  const firstNode = p.nodes[0];
  const lastNode = p.nodes[p.nodes.length - 1];
  return {
    doc: { version: 1, blocks: p.nodes.map((n) => n.block) },
    snapshot: {
      version: 1,
      text: src,
      bom: p.bom,
      frontMatter: p.frontMatter,
      eol: p.eol,
      leading: src.slice(p.base, firstNode ? firstNode.start : src.length),
      blocks,
      gaps,
      trailing: lastNode ? src.slice(lastNode.end) : "",
    },
  };
}
