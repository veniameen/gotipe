import { decodeString, punctuation, referenceLabel } from "./decode";
import { ANGLE_LINK, INLINE_HTML } from "./html";
import { type Source, range, sliceSource } from "./source";
import type { PhrasingContent } from "./types";

export interface InlineContext {
  references: Set<string>;
  inCell?: boolean;
  inLink?: boolean;
  inLabel?: boolean;
  preserveTrailing?: boolean;
  depth?: number;
  budget?: { remaining: number };
}
export interface Match {
  node: PhrasingContent;
  end: number;
}
export type ReadInline = (source: Source, context: InlineContext) => PhrasingContent[];

function bracketEnd(text: string, start: number, budget?: { remaining: number }): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (budget && --budget.remaining < 0) return -1;
    if (text[i] === "\\" && punctuation(text[i + 1])) {
      i++;
      continue;
    }
    if (text[i] === "<") {
      const token = ANGLE_LINK.exec(text.slice(i)) ?? INLINE_HTML.exec(text.slice(i));
      if (token) {
        i += token[0].length - 1;
        continue;
      }
    }
    if (text[i] === "`") {
      const ticks = /^`+/.exec(text.slice(i))![0];
      const end = text.indexOf(ticks, i + ticks.length);
      if (end >= 0) {
        i = end + ticks.length - 1;
        continue;
      }
    }
    if (text[i] === "[") depth++;
    if (text[i] === "]" && --depth === 0) return i;
  }
  return -1;
}

export function readDestination(text: string, from: number): { url: string; end: number } | null {
  let p = from;
  if (text[p] === "<") {
    p++;
    for (; p < text.length; p++) {
      if (text[p] === "\\" && punctuation(text[p + 1])) {
        p++;
        continue;
      }
      if (text[p] === ">") return { url: decodeString(text.slice(from + 1, p)), end: p + 1 };
      if (text[p] === "<" || text[p] === "\n") return null;
    }
    return null;
  }
  let depth = 0;
  for (; p < text.length; p++) {
    const c = text[p]!;
    if (c === "\\" && punctuation(text[p + 1])) {
      p++;
      continue;
    }
    if (c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127) break;
    if (c === "(") {
      if (++depth > 32) return null;
    } else if (c === ")") {
      if (!depth) break;
      depth--;
    }
  }
  return depth ? null : { url: decodeString(text.slice(from, p)), end: p };
}

export function readTitle(text: string, start: number): { title: string; end: number } | null {
  const open = text[start];
  if (open !== '"' && open !== "'" && open !== "(") return null;
  const close = open === "(" ? ")" : open;
  for (let p = start + 1; p < text.length; p++) {
    if (text[p] === "\\" && punctuation(text[p + 1])) {
      p++;
      continue;
    }
    if (text[p] === close) return { title: decodeString(text.slice(start + 1, p)), end: p + 1 };
    if (open === "(" && text[p] === "(") return null;
    if (text[p] === "\n" && /^\n[ \t]*\n/.test(text.slice(p))) return null;
  }
  return null;
}

export function readLink(
  source: Source,
  start: number,
  context: InlineContext,
  inline: ReadInline,
): Match | null {
  const text = source.text;
  const image = text[start] === "!";
  const open = start + (image ? 1 : 0);
  if (text[open] !== "[" || (context.inLink && !image)) return null;
  const close = bracketEnd(text, open, context.budget);
  if (close < 0) return null;
  const label = text.slice(open + 1, close);
  let end = close + 1;
  let url: string | undefined;
  let title: string | undefined;
  if (text[end] === "(") {
    let p = end + 1;
    while (/[ \t\n]/.test(text[p] ?? "") && p < text.length) p++;
    const destination = readDestination(text, p);
    if (destination) {
      const separated = /[ \t\n]/.test(text[destination.end] ?? "");
      p = destination.end;
      while (/[ \t\n]/.test(text[p] ?? "") && p < text.length) p++;
      if (separated) {
        const found = readTitle(text, p);
        if (found) {
          title = found.title;
          p = found.end;
        }
      }
      while (/[ \t\n]/.test(text[p] ?? "") && p < text.length) p++;
      if (text[p] === ")") {
        url = destination.url;
        end = p + 1;
      }
    }
  }
  if (url !== undefined) {
    const children = inline(sliceSource(source, open + 1, close), {
      ...context,
      inLink: false,
      inLabel: true,
      preserveTrailing: true,
      depth: (context.depth ?? 0) + 1,
    });
    // A link cannot contain another link, but image descriptions may contain links.
    if (!image && containsLink(children)) return null;
    const pos = range(source, start, end);
    if (image) {
      const plain = (nodes: PhrasingContent[]): string =>
        nodes
          .map((n) =>
            "value" in n
              ? n.value
              : "children" in n
                ? plain(n.children)
                : n.type === "image"
                  ? n.alt
                  : "\n",
          )
          .join("");
      return { node: { type: "image", url, title, alt: plain(children), position: pos }, end };
    }
    return { node: { type: "link", url, title, children, position: pos }, end };
  }
  let identifier = label;
  if (text[end] === "[") {
    const refEnd = text.indexOf("]", end + 1);
    if (refEnd >= 0 && !hasUnescapedBracket(text.slice(end + 1, refEnd))) {
      identifier = text.slice(end + 1, refEnd) || label;
      end = refEnd + 1;
    }
  }
  if (identifier.length > 999 || !context.references.has(referenceLabel(identifier))) return null;
  if (
    !image &&
    containsLink(
      inline(sliceSource(source, open + 1, close), {
        ...context,
        inLabel: true,
        depth: (context.depth ?? 0) + 1,
      }),
    )
  )
    return null;
  return {
    node: {
      type:
        label.startsWith("^") && end === close + 1
          ? "footnoteReference"
          : image
            ? "imageReference"
            : "linkReference",
      value: text.slice(start, end),
      position: range(source, start, end),
    },
    end,
  };
}

function hasUnescapedBracket(text: string): boolean {
  for (let p = 0; p < text.length; p++) {
    if (text[p] === "\\" && punctuation(text[p + 1])) {
      p++;
      continue;
    }
    if (text[p] === "[" || text[p] === "]") return true;
  }
  return false;
}

function containsLink(nodes: PhrasingContent[]): boolean {
  return nodes.some(
    (node) =>
      node.type === "link" ||
      node.type === "linkReference" ||
      ("children" in node && containsLink(node.children)),
  );
}

export function readAutolink(
  source: Source,
  start: number,
  context: InlineContext,
  literalOnly = false,
): Match | null {
  if (context.inLink) return null;
  const tail = source.text.slice(start);
  const angle = literalOnly ? null : ANGLE_LINK.exec(tail);
  if (angle) {
    const label = (angle[1] ?? angle[2])!;
    return {
      node: {
        type: "link",
        url: /^[A-Za-z][A-Za-z\d+.-]*:/.test(label) ? label : `mailto:${label}`,
        children: [
          {
            type: "text",
            value: label,
            position: range(source, start + 1, start + 1 + label.length),
          },
        ],
        position: range(source, start, start + angle[0].length),
      },
      end: start + angle[0].length,
    };
  }
  if (context.inLabel) return null;
  const before = source.text[start - 1];
  if (before && /[\p{L}\p{N}_]/u.test(before)) return null;
  const match =
    /^(?:https?:\/\/|www\.)[^\s<>]+/i.exec(tail) ??
    /^[A-Za-z\d.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z\d](?:[A-Za-z\d.-]*\.)[A-Za-z]{2,}/.exec(tail);
  if (!match) return null;
  let label = match[0].replace(/[?!.,:*_~]+$/, "");
  // A closing parenthesis is part of a URL only when it balances an opening one.
  const opens = (label.match(/\(/g) ?? []).length;
  let closes = (label.match(/\)/g) ?? []).length;
  while (closes > opens && label.endsWith(")")) {
    label = label.slice(0, -1);
    closes--;
  }
  label = label.replace(/&[A-Za-z\d]+;$/, "");
  if (!label) return null;
  const url = label.startsWith("www.")
    ? `http://${label}`
    : label.includes("://")
      ? label
      : `mailto:${label}`;
  const end = start + label.length;
  return {
    node: {
      type: "link",
      url,
      children: [{ type: "text", value: label, position: range(source, start, end) }],
      position: range(source, start, end),
    },
    end,
  };
}
