import { align, alignInlineCode, alignLoose } from "./align";
import { imageText, mentionLabel, mentionOf } from "./atoms";
import type { Link, Nodes, PhrasingContent } from "./grammar/types";
import { inlineHtmlMark } from "./inline-html";
import { normalizeSpans } from "./model";
import type { InlineAtoms, Mark, RawSegment, Span } from "./types";
import { normalizeEol } from "./util";

export interface InlineParseCtx {
  /** Full Markdown text. */
  src: string;
  /** Offset of the parsed body in `src` (BOM + front matter length). */
  base: number;
  /** Compute segments (false for internal verification parses). */
  segments: boolean;
  /** Inline atoms the reader was asked for. */
  atoms?: InlineAtoms;
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
  /**
   * Text offsets of the spaces that are soft line breaks of the source (D-88): the writer puts
   * the line ending back while the words around them stay (`serialization/line-breaks.ts`).
   * Found through the segments, so only when they are computed.
   */
  softBreaks: number[];
}

const BR_RE = /^<br[ \t]*\/?>$/i;

class Builder {
  spans: Span[] = [];
  text = "";
  segs: RawSegment[] = [];
  softBreaks: number[] = [];
  /** Atoms read so far: each gets its own `key`, renumbered in document order later. */
  private atoms = 0;

  /**
   * The mark of the atom that starts here. Its `key` keeps it apart from an equal neighbour;
   * `numberAtoms` (atoms.ts) gives the final keys once the whole document is read.
   */
  atom(type: string, attrs?: Record<string, unknown>): Mark {
    return { type, attrs: { ...attrs, key: String(++this.atoms) } };
  }

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

/** A mention's text is plain or formatted text: no HTML, images, references or other atoms. */
function plainChildren(node: Link | { children: PhrasingContent[] }): boolean {
  return node.children.every(
    (child) =>
      child.type === "text" ||
      child.type === "inlineCode" ||
      child.type === "break" ||
      ("children" in child && child.type !== "link" && plainChildren(child)),
  );
}

function plainText(node: Nodes): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  // a line break is text: a link of a hard break alone is not empty
  if (node.type === "break") return "\n";
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
  return {
    spans: normalizeSpans(b.spans),
    text: b.text,
    segs: b.segs,
    softBreaks: b.softBreaks,
  };
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
          softBreaksOf(r, runText, ctx.src, t0, b.softBreaks);
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
      const segs = wantSegs ? align(value, ctx.src, range[0], range[1], "text") : null;
      if (segs) softBreaksOf(segs, value, ctx.src, b.text.length, b.softBreaks);
      b.push(value, marks, segs, wantSegs ? range : null);
      return;
    }
    case "break":
      b.push("\n", marks, null, wantSegs ? range : null);
      return;
    case "inlineCode": {
      const value = normalizeEol(node.value);
      const segs = wantSegs
        ? alignInlineCode(value, ctx.src, range[0], range[1], flags.inCell)
        : null;
      if (segs) softBreaksOf(segs, value, ctx.src, b.text.length, b.softBreaks);
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
      const mention = ctx.atoms?.mention && plainChildren(node) ? mentionOf(node.url) : null;
      if (mention) {
        const label = node.title || mentionLabel(mention.kind, plainText(node));
        const atom = b.atom("mention", { ...mention, label });
        const [from, to] = range ?? [0, 0];
        walk(node.children, [...marks, atom], b, ctx, flags, from, to, noSegs);
        return;
      }
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
    case "inlineMath":
    case "emoji": {
      // The grammar reads these only when asked; the text is the source as written.
      const math = node.type === "inlineMath";
      const atom = math
        ? b.atom("inlineMath")
        : b.atom("customEmoji", { name: node.name, src: ctx.atoms?.customEmoji?.[node.name] });
      const pad = math ? 1 : 0;
      const [mdFrom, mdTo] = wantSegs ? [range[0] + pad, range[1] - pad] : [0, 0];
      // An escaped `|` of a table cell makes the source longer than the text.
      const exact = mdTo - mdFrom === node.value.length;
      const segs: RawSegment[] | null = wantSegs
        ? [{ textFrom: 0, textTo: node.value.length, mdFrom, mdTo, exact }]
        : null;
      b.push(node.value, [...marks, atom], segs, null);
      return;
    }
    case "image": {
      if (!ctx.atoms?.inlineImage || node.title) break;
      const atom = b.atom("inlineImage", { src: node.url, alt: node.alt });
      b.push(imageText(node.url, node.alt), [...marks, atom], null, wantSegs ? range : null);
      return;
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
    softBreaks: r.softBreaks.filter((at) => at >= k).map((at) => at - k),
  };
}

/**
 * The soft line breaks among aligned segments: a space of the value that stands for a line
 * ending of the source. `base` is where the value starts in the block text.
 */
function softBreaksOf(
  segs: readonly RawSegment[],
  value: string,
  src: string,
  base: number,
  out: number[],
): void {
  for (const s of segs) {
    if (s.exact || s.textTo - s.textFrom !== 1 || value[s.textFrom] !== " ") continue;
    if (/[\r\n]/.test(src.slice(s.mdFrom, s.mdTo))) out.push(base + s.textFrom);
  }
}
