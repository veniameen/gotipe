import { emojiEnd, mathEnd } from "../atoms";
import { AutolinkScanner, charBefore } from "./autolinks";
import { REFERENCE, decodeReference, punctuation } from "./decode";
import { INLINE_HTML } from "./html";
import { type InlineContext, readAutolink, readLink } from "./links";
import { type Source, range } from "./source";
import type { PhrasingContent, Text } from "./types";

interface Delimiter {
  marker: string;
  count: number;
  open: boolean;
  close: boolean;
  start: number;
  end: number;
}
type Token = PhrasingContent | Delimiter;
const isDelimiter = (node: Token): node is Delimiter => "marker" in node;
/** CommonMark's Unicode whitespace (Zs, tab, line feed, form feed, carriage return) or an edge. */
const whitespace = (char: string | undefined): boolean => !char || /^[\t\n\f\r\p{Zs}]$/u.test(char);
const unicodePunctuation = (char: string | undefined): boolean =>
  !!char && /[\p{P}\p{S}]/u.test(char);

function delimiter(text: string, start: number, count: number): Delimiter {
  const marker = text[start]!;
  // whole code points: an emoji is punctuation for flanking, not half of a surrogate pair
  const before = charBefore(text, start);
  const next = text.codePointAt(start + count);
  const after = next === undefined ? undefined : String.fromCodePoint(next);
  const left =
    !whitespace(after) &&
    (!unicodePunctuation(after) || whitespace(before) || unicodePunctuation(before));
  const right =
    !whitespace(before) &&
    (!unicodePunctuation(before) || whitespace(after) || unicodePunctuation(after));
  return {
    marker,
    count,
    start,
    end: start + count,
    open: left && (marker !== "_" || !right || unicodePunctuation(before)),
    close: right && (marker !== "_" || !left || unicodePunctuation(after)),
  };
}

function toNode(token: Token, source: Source): PhrasingContent {
  return isDelimiter(token)
    ? {
        type: "text",
        value: token.marker.repeat(token.count),
        position: range(source, token.start, token.end),
      }
    : token;
}

function resolve(tokens: Token[], source: Source): PhrasingContent[] {
  // Bound pathological delimiter searching; unmatched syntax remains readable literal text.
  let budget = source.text.length * 12 + 100;
  for (let closer = 0; closer < tokens.length && budget > 0; closer++) {
    const end = tokens[closer]!;
    if (!isDelimiter(end) || !end.close) continue;
    for (let opener = closer - 1; opener >= 0 && budget-- > 0; opener--) {
      const start = tokens[opener]!;
      if (!isDelimiter(start) || !start.open || start.marker !== end.marker) continue;
      if (start.marker === "~" && start.count !== end.count) continue;
      if (
        start.marker !== "~" &&
        (start.close || end.open) &&
        (start.count + end.count) % 3 === 0 &&
        (start.count % 3 !== 0 || end.count % 3 !== 0)
      )
        continue;
      const size = start.count >= 2 && end.count >= 2 ? 2 : 1;
      const node: PhrasingContent = {
        type: start.marker === "~" ? "delete" : size === 2 ? "strong" : "emphasis",
        children: coalesce(tokens.slice(opener + 1, closer).map((token) => toNode(token, source))),
        position: range(source, start.end - size, end.start + size),
      };
      start.count -= size;
      start.end -= size;
      end.count -= size;
      end.start += size;
      const replacement: Token[] = [];
      if (start.count) replacement.push(start);
      replacement.push(node);
      if (end.count) replacement.push(end);
      tokens.splice(opener, closer - opener + 1, ...replacement);
      closer = opener + replacement.length - (end.count ? 2 : 1);
      break;
    }
  }
  return coalesce(tokens.map((token) => toNode(token, source)));
}

/**
 * Text nodes that touch in the source as one node. Until autolinks are read, the text of escapes
 * and character references stays apart (`decoded`); `final` joins it and drops the flag.
 */
function coalesce(input: PhrasingContent[], final = false): PhrasingContent[] {
  const nodes: PhrasingContent[] = [];
  for (const item of input) {
    let node = item;
    if (final && (node.type === "emphasis" || node.type === "strong" || node.type === "delete")) {
      node = { ...node, children: coalesce(node.children, true) };
    }
    if (final && node.type === "text" && node.decoded) {
      const { decoded: _, ...plain } = node;
      node = plain;
    }
    const previous = nodes.at(-1);
    if (
      node.type === "text" &&
      previous?.type === "text" &&
      (final || !previous.decoded === !node.decoded) &&
      previous.position?.end.offset === node.position?.start.offset &&
      previous.position !== undefined
    ) {
      previous.value += node.value;
      previous.position!.end = node.position!.end;
    } else nodes.push(node);
  }
  return nodes;
}

/**
 * GFM autolink literals in a run of text nodes (`autolinks.ts`): the text of escapes and
 * references, which stays apart until now, may be part of an address but cannot start one.
 */
function decodedAutolinks(nodes: PhrasingContent[], context: InlineContext): PhrasingContent[] {
  if (context.inLink || context.inLabel) return nodes;
  const out: PhrasingContent[] = [];
  for (let i = 0; i < nodes.length; ) {
    const node = nodes[i]!;
    if (node.type === "emphasis" || node.type === "strong" || node.type === "delete") {
      out.push({ ...node, children: decodedAutolinks(node.children, context) });
      i++;
      continue;
    }
    if (node.type !== "text") {
      out.push(node);
      i++;
      continue;
    }
    // the run of text nodes from here: one text for the reader of addresses
    let end = i;
    let text = "";
    const decoded: boolean[] = [];
    for (; nodes[end]?.type === "text"; end++) {
      const part = nodes[end] as Text;
      text += part.value;
      for (let k = 0; k < part.value.length; k++) decoded.push(part.decoded === true);
    }
    const links = /[@:]|www\./.test(text) ? literalLinks(text, decoded) : [];
    if (links.length === 0) out.push(...nodes.slice(i, end));
    else out.push(...links);
    i = end;
  }
  return out;
}

/** The text and links of `text`, or nothing when it holds no autolink literal. */
function literalLinks(text: string, decoded: readonly boolean[]): PhrasingContent[] {
  const result: PhrasingContent[] = [];
  const scanner = new AutolinkScanner(text, (index) => !decoded[index]);
  let from = 0;
  for (let p = 0; p < text.length; ) {
    const link = scanner.at(p, charBefore(text, p));
    if (!link) {
      p++;
      continue;
    }
    if (p > from) result.push({ type: "text", value: text.slice(from, p) });
    const label = text.slice(p, link.end);
    result.push({ type: "link", url: link.url, children: [{ type: "text", value: label }] });
    from = p = link.end;
  }
  if (result.length === 0) return result;
  if (from < text.length) result.push({ type: "text", value: text.slice(from) });
  return result;
}

export function readInline(source: Source, options: InlineContext): PhrasingContent[] {
  const text = source.text;
  const context = { ...options, budget: options.budget ?? { remaining: text.length * 24 + 1000 } };
  if ((context.depth ?? 0) > 64)
    return [{ type: "text", value: text, position: range(source, 0, text.length) }];
  const tokens: Token[] = [];
  /** `decoded`: the text of an escape or a reference (never part of an autolink literal). */
  const pushText = (value: string, start: number, end: number, decoded = false): void => {
    if (!value) return;
    const previous = tokens.at(-1);
    if (
      previous &&
      !isDelimiter(previous) &&
      previous.type === "text" &&
      !previous.decoded === !decoded &&
      previous.position?.end.offset === source.offsets[start]
    ) {
      previous.value += value;
      previous.position!.end = range(source, start, end).end;
    } else if (decoded) {
      tokens.push({ type: "text", value, position: range(source, start, end), decoded });
    } else tokens.push({ type: "text", value, position: range(source, start, end) });
  };
  for (let p = 0; p < text.length; ) {
    if (--context.budget!.remaining < 0) {
      pushText(text.slice(p), p, text.length);
      break;
    }
    const c = text[p]!;
    if (c === "\\") {
      if (text[p + 1] === "\n") {
        tokens.push({ type: "break", position: range(source, p, p + 2) });
        p += 2;
        while (text[p] === " " || text[p] === "\t") p++;
        continue;
      }
      if (punctuation(text[p + 1])) {
        pushText(text[p + 1]!, p, p + 2, true);
        p += 2;
        continue;
      }
    }
    if (c === "&") {
      REFERENCE.lastIndex = p;
      const match = REFERENCE.exec(text);
      if (match) {
        pushText(decodeReference(match[0]), p, p + match[0].length, true);
        p += match[0].length;
        continue;
      }
    }
    if (c === "`") {
      const run = /^`+/.exec(text.slice(p))![0];
      let end = p + run.length;
      let close = -1;
      while (end < text.length) {
        end = text.indexOf("`", end);
        if (end < 0) break;
        const count = /^`+/.exec(text.slice(end))![0].length;
        if (count === run.length) {
          close = end;
          break;
        }
        end += count;
      }
      if (close >= 0) {
        // CommonMark: line endings of a code span are spaces, then one space is stripped from
        // each side of content that is not all spaces
        let value = text.slice(p + run.length, close).replace(/\n/g, " ");
        if (/^ .+ $/s.test(value) && /[^ ]/.test(value)) value = value.slice(1, -1);
        if (context.inCell) value = value.replace(/\\\|/g, "|");
        end = close + run.length;
        tokens.push({ type: "inlineCode", value, position: range(source, p, end) });
        p = end;
        continue;
      }
      pushText(run, p, p + run.length);
      p += run.length;
      continue;
    }
    if (c === "$" && context.atoms?.inlineMath) {
      // A run of dollars is text; a single one may open a formula (see `mathEnd`).
      let run = 1;
      while (text[p + run] === "$") run++;
      const close = run === 1 ? mathEnd(text, p) : -1;
      if (close > 0) {
        // A cell writes `|` as `\|`, as in inline code.
        const value = text.slice(p + 1, close);
        tokens.push({
          type: "inlineMath",
          value: context.inCell ? value.replace(/\\\|/g, "|") : value,
          position: range(source, p, close + 1),
        });
        p = close + 1;
      } else {
        pushText(text.slice(p, p + run), p, p + run);
        p += run;
      }
      continue;
    }
    if (c === ":" && context.atoms?.customEmoji) {
      const end = emojiEnd(text, p, context.atoms.customEmoji);
      if (end > 0) {
        tokens.push({
          type: "emoji",
          value: text.slice(p, end),
          name: text.slice(p + 1, end - 1),
          position: range(source, p, end),
        });
        p = end;
        continue;
      }
    }
    if (c === "[" || (c === "!" && text[p + 1] === "[")) {
      const link = readLink(source, p, context, readInline);
      if (link) {
        tokens.push(link.node);
        p = link.end;
        continue;
      }
    }
    if (c === "<") {
      const link = readAutolink(source, p, context);
      if (link) {
        tokens.push(link.node);
        p = link.end;
        continue;
      }
      if (c === "<") {
        const html = INLINE_HTML.exec(text.slice(p));
        if (html) {
          tokens.push({
            type: "html",
            value: html[0],
            position: range(source, p, p + html[0].length),
          });
          p += html[0].length;
          continue;
        }
      }
    }
    if (c === "*" || c === "_" || c === "~") {
      let count = 1;
      while (text[p + count] === c) count++;
      if (c !== "~" || count <= 2) tokens.push(delimiter(text, p, count));
      else pushText(c.repeat(count), p, p + count);
      p += count;
      continue;
    }
    if (c === " " || c === "\t") {
      let end = p + 1;
      while (text[end] === " " || text[end] === "\t") end++;
      if (text[end] === "\n") {
        // two spaces make a hard break; otherwise a soft one, which is a space (CommonMark)
        if (/ {2,}$/.test(text.slice(p, end)))
          tokens.push({ type: "break", position: range(source, p, end + 1) });
        else pushText(" ", p, end + 1);
        p = end + 1;
        while (text[p] === " " || text[p] === "\t") p++;
        continue;
      }
      if (end === text.length && !context.preserveTrailing) break;
      pushText(text.slice(p, end), p, end);
      p = end;
      continue;
    }
    if (c === "\n") {
      // a soft line break is a space; the next line's indentation is not text
      let end = p + 1;
      while (text[end] === " " || text[end] === "\t") end++;
      pushText(" ", p, end);
      p = end;
      continue;
    }
    pushText(c === "\0" ? "�" : c, p, p + 1);
    p++;
  }
  return coalesce(decodedAutolinks(resolve(tokens, source), context), true);
}
