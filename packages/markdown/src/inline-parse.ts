import { align, alignInlineCode, alignLoose } from "./align";
import type { Nodes, PhrasingContent } from "./grammar/types";
import { inlineHtmlMark } from "./inline-html";
import { normalizeSpans } from "./model";
import type { Mark, RawSegment, Span } from "./types";
import { normalizeEol } from "./util";

export interface InlineParseCtx {
  /** Full Markdown text. */
  src: string;
  /** Offset of the parsed body in `src` (BOM + front matter length). */
  base: number;
  /** Compute segments (false for internal verification parses). */
  segments: boolean;
}

export interface InlineFlags {
  /** `<br>` becomes "\n" (table cells, headings). */
  brNewline: boolean;
  inCell: boolean;
}

export interface InlineResult {
  spans: Span[];
  text: string;
  /** Text offsets relative to the block text, md offsets absolute in `src`. */
  segs: RawSegment[];
  /** Line breaks in the text: soft (from text values) or hard (`break` nodes). */
  newlines: { at: number; hard: boolean }[];
}

const BR_RE = /^<br[ \t]*\/?>$/i;

class Builder {
  spans: Span[] = [];
  text = "";
  segs: RawSegment[] = [];
  newlines: { at: number; hard: boolean }[] = [];

  push(text: string, marks: Mark[], segs: RawSegment[] | null, range: [number, number] | null) {
    if (text.length === 0) return;
    const at = this.text.length;
    this.spans.push({ text, marks: marks.slice() });
    if (segs) {
      for (const s of segs) {
        this.segs.push({
          textFrom: s.textFrom + at,
          textTo: s.textTo + at,
          mdFrom: s.mdFrom,
          mdTo: s.mdTo,
          exact: s.exact,
        });
      }
    } else if (range) {
      this.segs.push({
        textFrom: at,
        textTo: at + text.length,
        mdFrom: range[0],
        mdTo: range[1],
        exact: false,
      });
    }
    this.text += text;
  }
}

function startOf(node: Nodes, ctx: InlineParseCtx): number | null {
  const o = node.position?.start.offset;
  return typeof o === "number" ? o + ctx.base : null;
}

function endOf(node: Nodes, ctx: InlineParseCtx): number | null {
  const o = node.position?.end.offset;
  return typeof o === "number" ? o + ctx.base : null;
}

function hasPos(node: Nodes): boolean {
  return (
    typeof node.position?.start.offset === "number" && typeof node.position?.end.offset === "number"
  );
}

function plainText(node: Nodes): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node) return (node.children as Nodes[]).map((c) => plainText(c)).join("");
  return "";
}

/** Convert phrasing content to spans + segments. */
export function parseInline(
  children: PhrasingContent[],
  ctx: InlineParseCtx,
  flags: InlineFlags,
  parentFrom: number,
  parentTo: number,
): InlineResult {
  const b = new Builder();
  walk(children, [], b, ctx, flags, parentFrom, parentTo, false);
  return { spans: normalizeSpans(b.spans), text: b.text, segs: b.segs, newlines: b.newlines };
}

function walk(
  children: PhrasingContent[],
  marks: Mark[],
  b: Builder,
  ctx: InlineParseCtx,
  flags: InlineFlags,
  parentFrom: number,
  parentTo: number,
  noSegs: boolean,
): void {
  let idx = 0;
  while (idx < children.length) {
    const node = children[idx]!;
    if (!noSegs && !hasPos(node)) {
      // Positionless run (e.g. GFM autolink literal transform): align the run as a whole.
      let k = idx;
      while (k < children.length && !hasPos(children[k]!)) k++;
      const left = idx > 0 ? (endOf(children[idx - 1]!, ctx) ?? parentFrom) : parentFrom;
      const right = k < children.length ? (startOf(children[k]!, ctx) ?? parentTo) : parentTo;
      const t0 = b.text.length;
      const segCount = b.segs.length;
      for (let m = idx; m < k; m++) walkNode(children[m]!, marks, b, ctx, flags, true);
      b.segs.length = segCount;
      if (ctx.segments) {
        const runText = b.text.slice(t0);
        const r = alignLoose(runText, ctx.src, left, right, 8);
        if (r) {
          for (const s of r) {
            b.segs.push({ ...s, textFrom: s.textFrom + t0, textTo: s.textTo + t0 });
          }
        } else if (runText.length > 0) {
          b.segs.push({
            textFrom: t0,
            textTo: b.text.length,
            mdFrom: left,
            mdTo: right,
            exact: false,
          });
        }
      }
      idx = k;
      continue;
    }
    if (node.type === "html") {
      const open = inlineHtmlMark(node.value);
      if (open) {
        const { tag, mark } = open;
        const close = findClose(children, idx, tag);
        if (close > idx + 1) {
          const from = endOf(node, ctx) ?? parentFrom;
          const to = startOf(children[close]!, ctx) ?? parentTo;
          walk(children.slice(idx + 1, close), [...marks, mark], b, ctx, flags, from, to, noSegs);
          idx = close + 1;
          continue;
        }
      }
    }
    walkNode(node, marks, b, ctx, flags, noSegs);
    idx++;
  }
}

function findClose(children: PhrasingContent[], openIdx: number, tag: string): number {
  let depth = 0;
  const openRe = new RegExp(`^<${tag}(?:\\s[^>]*)?>$`, "i");
  const closeRe = new RegExp(`^</${tag}>$`, "i");
  for (let k = openIdx; k < children.length; k++) {
    const c = children[k]!;
    if (c.type !== "html") continue;
    if (openRe.test(c.value)) depth++;
    else if (closeRe.test(c.value)) {
      depth--;
      if (depth === 0) return k;
    }
  }
  return -1;
}

function walkNode(
  node: PhrasingContent,
  marks: Mark[],
  b: Builder,
  ctx: InlineParseCtx,
  flags: InlineFlags,
  noSegs: boolean,
): void {
  const s = startOf(node, ctx);
  const e = endOf(node, ctx);
  const range: [number, number] | null = s !== null && e !== null ? [s, e] : null;
  const wantSegs = ctx.segments && !noSegs && range !== null;
  switch (node.type) {
    case "text": {
      const value = normalizeEol(node.value);
      const at = b.text.length;
      for (let i = value.indexOf("\n"); i !== -1; i = value.indexOf("\n", i + 1)) {
        b.newlines.push({ at: at + i, hard: false });
      }
      const segs = wantSegs ? align(value, ctx.src, range[0], range[1], "text") : null;
      b.push(value, marks, segs, wantSegs ? range : null);
      return;
    }
    case "break": {
      b.newlines.push({ at: b.text.length, hard: true });
      b.push("\n", marks, null, wantSegs ? range : null);
      return;
    }
    case "inlineCode": {
      const value = normalizeEol(node.value);
      const segs = wantSegs
        ? alignInlineCode(value, ctx.src, range[0], range[1], flags.inCell)
        : null;
      b.push(value, [...marks, { type: "code" }], segs, wantSegs ? range : null);
      return;
    }
    case "emphasis":
    case "strong":
    case "delete": {
      const type =
        node.type === "emphasis" ? "italic" : node.type === "strong" ? "bold" : "strikethrough";
      walk(
        node.children,
        [...marks, { type }],
        b,
        ctx,
        flags,
        range?.[0] ?? 0,
        range?.[1] ?? 0,
        noSegs,
      );
      return;
    }
    case "link": {
      if (plainText(node) === "") break;
      const attrs: Record<string, unknown> = { href: node.url };
      if (typeof node.title === "string" && node.title !== "") attrs.title = node.title;
      walk(
        node.children,
        [...marks, { type: "link", attrs }],
        b,
        ctx,
        flags,
        range?.[0] ?? 0,
        range?.[1] ?? 0,
        noSegs,
      );
      return;
    }
    case "html": {
      if (flags.brNewline && BR_RE.test(node.value)) {
        b.push("\n", marks, null, wantSegs ? range : null);
        return;
      }
      break;
    }
    default:
      break;
  }
  // Verbatim source (other inline HTML, references, inline images, unknown nodes).
  if (range) {
    const raw = ctx.src.slice(range[0], range[1]);
    const segs: RawSegment[] | null = wantSegs
      ? [{ textFrom: 0, textTo: raw.length, mdFrom: range[0], mdTo: range[1], exact: true }]
      : null;
    b.push(raw, [...marks, { type: "mdRaw" }], segs, null);
  } else {
    b.push(plainText(node), marks, null, null);
  }
}

/** Drop the first `k` chars of an inline result (callout labels). */
export function trimInlineStart(r: InlineResult, k: number): InlineResult {
  if (k <= 0) return r;
  const spans: Span[] = [];
  let pos = 0;
  for (const s of r.spans) {
    const end = pos + s.text.length;
    if (end > k) spans.push({ text: s.text.slice(Math.max(0, k - pos)), marks: s.marks });
    pos = end;
  }
  const segs: RawSegment[] = [];
  for (const s of r.segs) {
    if (s.textTo <= k) continue;
    if (s.textFrom < k) {
      if (!s.exact) continue;
      const cut = k - s.textFrom;
      segs.push({
        textFrom: 0,
        textTo: s.textTo - k,
        mdFrom: s.mdFrom + cut,
        mdTo: s.mdTo,
        exact: true,
      });
      continue;
    }
    segs.push({ ...s, textFrom: s.textFrom - k, textTo: s.textTo - k });
  }
  return {
    spans: normalizeSpans(spans),
    text: r.text.slice(k),
    segs,
    newlines: r.newlines.filter((n) => n.at >= k).map((n) => ({ at: n.at - k, hard: n.hard })),
  };
}
