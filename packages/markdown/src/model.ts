import type { Block, Mark, Span } from "./types";
import { stableStringify } from "./util";

const MARK_RANK: Record<string, number> = {
  bold: 1,
  italic: 2,
  underline: 3,
  strikethrough: 4,
  code: 5,
  link: 6,
  highlight: 7,
  superscript: 8,
  subscript: 9,
  mdRaw: 10,
};

/** Block types whose content is rich text. */
export const RICH_TYPES = new Set([
  "paragraph",
  "heading",
  "listItem",
  "todoItem",
  "blockquote",
  "callout",
  "tableCell",
  "tableHeader",
]);

/** Markdown style attrs: they do not change the meaning and are ignored by fingerprints. */
export const STYLE_ATTRS = new Set(["marker", "delimiter", "spread", "breaks"]);

const SEMANTIC_ATTRS: Record<string, string[]> = {
  paragraph: [],
  heading: ["level"],
  bulletList: [],
  orderedList: ["start"],
  listItem: [],
  todoList: [],
  todoItem: ["checked"],
  blockquote: [],
  callout: ["type", "alert"],
  codeBlock: ["language", "meta"],
  divider: [],
  image: ["src", "alt", "caption"],
  file: ["url", "name"],
  table: ["align"],
  tableRow: [],
  tableCell: [],
  tableHeader: [],
  markdownRaw: ["kind"],
};

export const ALERTS: Record<string, string> = {
  note: "NOTE",
  tip: "TIP",
  important: "IMPORTANT",
  warning: "WARNING",
  caution: "CAUTION",
};

/** Maps GoTipe callout types that are not GFM alerts to the closest alert. */
const CALLOUT_FALLBACK: Record<string, string> = {
  info: "NOTE",
  success: "TIP",
  error: "CAUTION",
  danger: "CAUTION",
};

/**
 * Resolves a callout block to a GFM alert name (`NOTE`, `TIP`, ...).
 * Other GoTipe types map to the closest alert; unknown types become `NOTE`.
 */
export function calloutKind(attrs: Record<string, unknown>): string {
  const type = typeof attrs.type === "string" ? attrs.type.toLowerCase() : "";
  const alert = typeof attrs.alert === "string" ? attrs.alert.toUpperCase() : "";
  if (alert && Object.values(ALERTS).includes(alert)) return alert;
  // own keys only: a type like "constructor" must not reach the object's prototype
  if (Object.hasOwn(ALERTS, type)) return ALERTS[type]!;
  if (Object.hasOwn(CALLOUT_FALLBACK, type)) return CALLOUT_FALLBACK[type]!;
  return "NOTE";
}

export function linkAttrs(mark: Mark): { href: string; title?: string } {
  const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
  const title = mark.attrs?.title;
  return typeof title === "string" && title !== "" ? { href, title } : { href };
}

function canonicalMark(mark: Mark): Mark {
  if (mark.type === "link") return { type: "link", attrs: linkAttrs(mark) };
  if (MARK_RANK[mark.type] !== undefined && mark.type !== "highlight") return { type: mark.type };
  return mark.attrs && Object.keys(mark.attrs).length > 0
    ? { type: mark.type, attrs: mark.attrs }
    : { type: mark.type };
}

export function markKey(mark: Mark): string {
  return stableStringify(canonicalMark(mark));
}

export function sortMarks(marks: Mark[]): Mark[] {
  const seen = new Set<string>();
  const out: Mark[] = [];
  for (const m of marks) {
    const c = canonicalMark(m);
    const k = stableStringify(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  out.sort((a, b) => {
    const ra = MARK_RANK[a.type] ?? 100;
    const rb = MARK_RANK[b.type] ?? 100;
    if (ra !== rb) return ra - rb;
    const ka = stableStringify(a);
    const kb = stableStringify(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return out;
}

/** Canonical marks, adjacent equal-mark spans merged, empty spans dropped. */
export function normalizeSpans(spans: readonly Span[]): Span[] {
  const out: Span[] = [];
  let lastKey = "";
  for (const s of spans) {
    if (!s || typeof s.text !== "string" || s.text.length === 0) continue;
    const marks = sortMarks(Array.isArray(s.marks) ? s.marks : []);
    const key = marks.map((m) => stableStringify(m)).join("|");
    const prev = out[out.length - 1];
    if (prev && key === lastKey) prev.text += s.text;
    else {
      out.push({ text: s.text, marks });
      lastKey = key;
    }
  }
  return out;
}

export function spansText(spans: readonly Span[]): string {
  let t = "";
  for (const s of spans) t += s.text;
  return t;
}

export function richContent(block: Block): Span[] {
  return Array.isArray(block.content) ? normalizeSpans(block.content) : [];
}

function semanticAttrs(block: Block): Record<string, unknown> {
  const attrs = block.attrs ?? {};
  const keys = SEMANTIC_ATTRS[block.type];
  if (!keys) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(attrs)) if (!STYLE_ATTRS.has(k)) out[k] = attrs[k];
    return out;
  }
  switch (block.type) {
    case "heading":
      return { level: clampLevel(attrs.level) };
    case "orderedList":
      return { start: listStart(attrs.start) };
    case "todoItem":
      return { checked: attrs.checked === true };
    // a task of a bullet list (D-156): a change of its mark rewrites it
    case "listItem":
      return attrs.checked === undefined ? {} : { checked: attrs.checked === true };
    case "callout":
      return { kind: calloutKind(attrs) };
    case "codeBlock":
      return {
        language: typeof attrs.language === "string" ? attrs.language : "",
        meta: typeof attrs.meta === "string" && attrs.meta !== "" ? attrs.meta : undefined,
      };
    case "image":
      return {
        src: str(attrs.src),
        alt: str(attrs.alt),
        caption: str(attrs.caption),
      };
    case "file":
      return { url: str(attrs.url), name: str(attrs.name) };
    case "table": {
      // a column without alignment is `---` whether `align` names it (null) or not
      const align = Array.isArray(attrs.align) ? attrs.align.map((a) => normalizeAlign(a)) : [];
      while (align.length > 0 && align[align.length - 1] === null) align.pop();
      return { align };
    }
    case "markdownRaw":
      return { kind: str(attrs.kind) };
    default: {
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = attrs[k];
      return out;
    }
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
}

export function normalizeAlign(a: unknown): "left" | "right" | "center" | null {
  return a === "left" || a === "right" || a === "center" ? a : null;
}

export function clampLevel(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? "1"), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(1, Math.trunc(n)));
}

export function listStart(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? "1"), 10);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 1;
}

/** The bullet a list is written with: `override`, else its `marker`, else `-`. */
export function bulletMarker(attrs: Record<string, unknown>, override?: string): string {
  const m = override ?? attrs.marker;
  return m === "*" || m === "+" || m === "-" ? m : "-";
}

function contentForFingerprint(block: Block): unknown {
  const c = block.content;
  if (Array.isArray(c)) return normalizeSpans(c);
  if (typeof c === "string") return c;
  return null;
}

/** Canonical, id-free projection of a block (used for fingerprints and equality). */
export function canonicalBlock(block: Block): unknown {
  return {
    t: block.type,
    a: semanticAttrs(block),
    c: contentForFingerprint(block),
    ch: (block.children ?? []).map((b) => canonicalBlock(b)),
  };
}

/** Stable JSON of the block without ids (recursively) and without Markdown style attrs. */
export function fingerprint(block: Block): string {
  return stableStringify(canonicalBlock(block));
}

/**
 * `block` as its Markdown reads back, by what the writer writes on purpose: a line ending of
 * the text is "\n" (D-94), a line break inside inline code has no code mark (D-89), and a line
 * break of a link destination is `%0A`. A rendering is compared with this.
 */
export function asWritten(block: Block): Block {
  const content = Array.isArray(block.content)
    ? block.content.flatMap((span): Span[] => {
        const text = span.text.replace(/\r\n?/g, "\n");
        const marks = (span.marks ?? []).map((mark) =>
          mark.type === "link" && typeof mark.attrs?.href === "string"
            ? {
                ...mark,
                attrs: { ...mark.attrs, href: mark.attrs.href.replace(/\r\n?|\n/g, "%0A") },
              }
            : mark,
        );
        if (!marks.some((mark) => mark.type === "code") || !text.includes("\n"))
          return [{ text, marks }];
        const plain = marks.filter((mark) => mark.type !== "code");
        return text
          .split(/(\n)/)
          .filter((part) => part !== "")
          .map((part) => ({ text: part, marks: part === "\n" ? plain : marks }));
      })
    : block.content;
  return { ...block, content, children: (block.children ?? []).map(asWritten) };
}

/**
 * Whether the serializer skips the block when it has to (re)write it: paragraphs,
 * headings and math without text, raw blocks without content, embeds without an
 * address, tables without cells.
 */
export function isBlockEmpty(block: Block): boolean {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return spansText(richContent(block)).length === 0;
    case "markdownRaw":
      return typeof block.content !== "string" || block.content.length === 0;
    case "math":
      return typeof block.content === "string"
        ? block.content.length === 0
        : spansText(richContent(block)).length === 0;
    case "embed":
      return str(block.attrs?.url) === "";
    case "table":
      // a table is kept while any row has a cell, even when its first row has none
      return !(block.children ?? []).some((row) => (row.children?.length ?? 0) > 0);
    default:
      return false;
  }
}
