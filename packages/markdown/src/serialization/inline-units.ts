import { cssColor } from "../inline-html";
import { linkAttrs, markKey } from "../model";
import type { Mark, Span } from "../types";
import type { EmoPair, InlineOptions, Unit } from "./inline-types";

interface Leaf {
  leaf: true;
  span: Span;
  ti: number;
  kind: "text" | "code" | "raw";
}

interface MarkNode {
  leaf?: false;
  mark: Mark;
  children: (MarkNode | Leaf)[];
}

const OPEN_ORDER: Record<string, number> = {
  link: 0,
  underline: 1,
  textColor: 1,
  highlight: 2,
  superscript: 3,
  subscript: 4,
  bold: 5,
  italic: 6,
  strikethrough: 7,
};

const TAGS: Record<string, string> = {
  underline: "u",
  highlight: "mark",
  superscript: "sup",
  subscript: "sub",
};

const ENTITY_GLOBAL = /&(?=(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});)/g;
const EMAIL_RE =
  /^[A-Za-z0-9.!#$%'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const BARE_URL_RE = /^(?:https?:\/\/|www\.)[^\s<>()&*_~`|[\]\\"'{}]+$/i;
/** Link destination: raw form when safe, `<...>` otherwise. */
export function linkDestination(href: string): string {
  if (href === "") return "<>";
  let balanced = true;
  let depth = 0;
  for (const c of href) {
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth < 0) balanced = false;
    }
  }
  if (depth !== 0) balanced = false;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control chars are not allowed in raw destinations
  if (balanced && !/[\s<>\\\u0000-\u001f\u007f]/.test(href)) {
    return href.replace(ENTITY_GLOBAL, "\\&");
  }
  const inner = href
    .replace(/[\\<>]/g, "\\$&")
    .replace(ENTITY_GLOBAL, "\\&")
    .replace(/\r\n?|\n/g, "%0A");
  return `<${inner}>`;
}

export function linkTitle(title: string): string {
  return `"${title.replace(/[\\"]/g, "\\$&").replace(ENTITY_GLOBAL, "\\&")}"`;
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

/** Builds the mark nesting tree from flat spans. */
function buildTree(spans: Span[]): MarkNode {
  const root: MarkNode = { mark: { type: "" }, children: [] };
  const containerMarks = spans.map((s) => {
    let linkSeen = false;
    const out: Mark[] = [];
    for (const m of s.marks) {
      if (m.type === "code" || m.type === "mdRaw") continue;
      if (m.type === "link") {
        if (linkSeen) continue;
        linkSeen = true;
      }
      out.push(m);
    }
    return out;
  });
  const keys = containerMarks.map((ms) => ms.map((m) => markKey(m)));
  const extent = (key: string, from: number): number => {
    let n = 0;
    for (let i = from; i < spans.length && keys[i]!.includes(key); i++) n++;
    return n;
  };
  const stack: { key: string; node: MarkNode }[] = [];
  let ti = 0;
  spans.forEach((span, i) => {
    const ks = keys[i]!;
    let keep = 0;
    while (keep < stack.length && ks.includes(stack[keep]!.key)) keep++;
    stack.length = keep;
    const open = containerMarks[i]!.map((m, idx) => ({ m, key: ks[idx]! }))
      .filter((x) => !stack.some((s) => s.key === x.key))
      .map((x) => ({ ...x, ext: extent(x.key, i) }))
      .sort((a, b) => b.ext - a.ext || (OPEN_ORDER[a.m.type] ?? 9) - (OPEN_ORDER[b.m.type] ?? 9));
    for (const o of open) {
      const node: MarkNode = { mark: o.m, children: [] };
      (stack[stack.length - 1]?.node ?? root).children.push(node);
      stack.push({ key: o.key, node });
    }
    const raw = span.marks.some((m) => m.type === "mdRaw");
    const code = !raw && span.marks.some((m) => m.type === "code");
    const leaf: Leaf = { leaf: true, span, ti, kind: raw ? "raw" : code ? "code" : "text" };
    (stack[stack.length - 1]?.node ?? root).children.push(leaf);
    ti += span.text.length;
  });
  return root;
}

function emphasisPair(type: string): EmoPair | null {
  if (type === "bold")
    return { delim: "**", openTag: "<strong>", closeTag: "</strong>", tag: false };
  if (type === "italic") return { delim: "*", openTag: "<em>", closeTag: "</em>", tag: false };
  if (type === "strikethrough")
    return { delim: "~~", openTag: "<s>", closeTag: "</s>", tag: false };
  return null;
}

function buildUnits(root: MarkNode, o: InlineOptions): Unit[] {
  const units: Unit[] = [];
  const emitLeaf = (leaf: Leaf): void => {
    const text = leaf.span.text;
    if (leaf.kind === "raw") {
      units.push({ k: "lit", s: text, ti: leaf.ti });
      return;
    }
    if (leaf.kind === "code") {
      const fence = "`".repeat(longestRun(text, "`") + 1);
      const pad =
        text.startsWith("`") ||
        text.endsWith("`") ||
        (text.startsWith(" ") && text.endsWith(" ") && /[^ ]/.test(text))
          ? " "
          : "";
      units.push({ k: "syn", s: fence + pad });
      units.push({ k: "code", s: text, ti: leaf.ti });
      units.push({ k: "syn", s: pad + fence });
      return;
    }
    let ti = leaf.ti;
    for (const ch of text) {
      if (ch === "\n") units.push({ k: "nl", ti });
      else if (ch === "\r") {
        /* dropped: model uses "\n" */
      } else units.push({ k: "t", ch, ti });
      ti += ch.length;
    }
  };
  const emit = (node: MarkNode): void => {
    for (const child of node.children) {
      if (child.leaf) {
        emitLeaf(child);
        continue;
      }
      const type = child.mark.type;
      const pair = emphasisPair(type);
      if (pair) {
        units.push({ k: "emo", pair, open: true });
        emit(child);
        units.push({ k: "emo", pair, open: false });
        continue;
      }
      if (type === "textColor") {
        const color = cssColor(child.mark.attrs?.color);
        if (color) units.push({ k: "syn", s: `<span style="color:${color}">` });
        emit(child);
        if (color) units.push({ k: "syn", s: "</span>" });
        continue;
      }
      const tag = TAGS[type];
      if (tag) {
        const color = type === "highlight" ? cssColor(child.mark.attrs?.color) : null;
        units.push({ k: "syn", s: color ? `<${tag} style="background:${color}">` : `<${tag}>` });
        emit(child);
        units.push({ k: "syn", s: `</${tag}>` });
        continue;
      }
      if (type === "link") {
        emitLink(child);
        continue;
      }
      emit(child);
    }
  };
  const emitLink = (node: MarkNode): void => {
    const { href, title } = linkAttrs(node.mark);
    const only = node.children.length === 1 ? node.children[0] : undefined;
    const text = only?.leaf && only.kind === "text" ? only.span.text : null;
    if (text !== null && only?.leaf && title === undefined && o.tier < 2 && o.kind !== "alt") {
      const noPipe = o.kind !== "cell" || !href.includes("|");
      const bare =
        o.tier === 0 &&
        noPipe &&
        BARE_URL_RE.test(text) &&
        /[A-Za-z0-9/]$/.test(text) &&
        (href === text || href === `http://${text}`) &&
        (href !== text || /^https?:/i.test(text));
      if (bare) {
        units.push({ k: "lit", s: text, ti: only.ti });
        return;
      }
      // biome-ignore lint/suspicious/noControlCharactersInRegex: autolinks cannot contain control chars
      const angle = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>&\u0000-\u001f]*$/.test(href);
      if (noPipe && angle && href === text) {
        units.push({ k: "syn", s: "<" });
        units.push({ k: "lit", s: text, ti: only.ti });
        units.push({ k: "syn", s: ">" });
        return;
      }
      if (noPipe && href === `mailto:${text}` && EMAIL_RE.test(text)) {
        units.push({ k: "syn", s: "<" });
        units.push({ k: "lit", s: text, ti: only.ti });
        units.push({ k: "syn", s: ">" });
        return;
      }
    }
    units.push({ k: "syn", s: "[" });
    emit(node);
    let dest = linkDestination(href);
    if (o.kind === "cell") dest = dest.replace(/\|/g, "\\|");
    let tail = `](${dest}`;
    if (title !== undefined) {
      let t = linkTitle(title);
      if (o.kind === "cell") t = t.replace(/\|/g, "\\|");
      tail += ` ${t}`;
    }
    units.push({ k: "syn", s: `${tail})` });
  };
  emit(root);
  return units;
}

export function inlineUnits(spans: Span[], options: InlineOptions): Unit[] {
  return buildUnits(buildTree(spans), options);
}
