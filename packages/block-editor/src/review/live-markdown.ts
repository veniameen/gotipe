import { parseMarkdown } from "@gotipe/markdown";

/**
 * A growing Markdown text as it is read while it is unfinished (a review's live proposal). What
 * its end leaves open is closed or kept as text, so the blocks shown so far and the text that
 * follows the insertion keep their look:
 * - a code block still open is closed here, so it holds the code written so far and does not
 *   take what follows;
 * - a mark opened and not closed in the last paragraph (`**`, `*`, `_`, `~~`, a code span, a
 *   link, `<`) is text: it cannot pair with a mark of the text after the insertion;
 * - a table grows by whole rows: its last line, while unfinished, is a line of text under it,
 *   and so is its delimiter row under the head row, so the table comes with all its columns;
 * - a last line of only `-` or `=` under a line of text is text, not yet a heading's underline;
 * - a backslash at the very end is text.
 * Whatever is finished is read as Markdown, and a finished text comes back as it is: a fence in
 * an indented code block is code, and CRLF line ends are line ends (what is added keeps them).
 * It takes time in proportion to the text, however many marks its end leaves open.
 */
export function settleLiveMarkdown(text: string): string {
  const lines = text.split("\n");
  // what is added keeps the line ends the text is written with
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let fence: Fence | null = null;
  // the content columns of the list items the lines stand in, the innermost last
  const items: number[] = [];
  // where the last run of lines without a blank line or a code block between starts
  let scope = 0;
  let offset = 0;
  // the line before is of an indented code block
  let code = false;
  lines.forEach((line, index) => {
    const next = offset + line.length + 1;
    if (fence) {
      if (closes(line, fence)) {
        fence = null;
        scope = next;
      }
    } else if (line.trim() === "") scope = next;
    else {
      const read = opening(line, index, items);
      fence = read.fence;
      // four columns in, where no paragraph goes on: code of an indented block, with no marks
      code = !fence && read.indent >= 4 && (code || offset === scope);
      if (code) scope = next;
    }
    offset = next;
  });
  const open = fence as Fence | null;
  if (open) {
    // a closing fence half written is not code yet
    const last = lines[lines.length - 1]!;
    const half = open.line < lines.length - 1 && closes(last, open, true);
    const body = half ? text.slice(0, text.length - last.length) : text;
    const close = `${open.prefix}${open.char.repeat(open.length)}`;
    return `${body}${body.endsWith("\n") ? "" : eol}${close}`;
  }
  if (scope >= text.length) return text;
  const escapes = openMarks(text.slice(scope)).map((at) => at + scope);
  const lastLine = text.lastIndexOf("\n") + 1;
  // only dashes or equals under a line of text: a heading's underline once the line is done
  if (UNDERLINE.test(text.slice(lastLine)) && (lastLine === 0 || lastLine > scope))
    escapes.push(lastLine + text.slice(lastLine).search(/[-=]/));
  if (/(?:^|[^\\])(?:\\\\)*\\$/.test(text)) escapes.push(text.length);
  // an unfinished line that a table would take as a row stands under it as a line of text
  const apart = lastLine > scope && lastLine < text.length && endsInTable(text.slice(scope));
  if (escapes.length === 0 && !apart) return text;
  let out = "";
  let from = 0;
  for (const at of [...new Set(escapes)].sort((a, b) => a - b)) {
    if (apart && from <= lastLine && at >= lastLine) {
      out += `${text.slice(from, lastLine)}${eol}`;
      from = lastLine;
    }
    out += `${text.slice(from, at)}\\`;
    from = at;
  }
  if (apart && from <= lastLine) {
    out += `${text.slice(from, lastLine)}${eol}`;
    from = lastLine;
  }
  return out + text.slice(from);
}

/** Whether these lines, read as finished, end in a table: its last line is one of its rows. */
function endsInTable(lines: string): boolean {
  if (!lines.includes("|")) return false;
  const blocks = parseMarkdown(`${lines}\n`).doc.blocks;
  return blocks[blocks.length - 1]?.type === "table";
}

/**
 * An open code block: its fence, what stands before a line inside it, the line it opened on.
 * `base` is the column its container's content starts at; in a quote, null: a quote's lines
 * close it with their markers before the fence, as they open it.
 */
interface Fence {
  char: string;
  length: number;
  prefix: string;
  line: number;
  base: number | null;
}

/** Columns of a run of spaces and tabs: a tab goes on to the next stop of four. */
function columns(space: string): number {
  let width = 0;
  for (const char of space) width = char === "\t" ? width + 4 - (width % 4) : width + 1;
  return width;
}

/**
 * The code block a line opens, if it does, and how far in its content stands from where the
 * content of its list item starts (four and more: code of an indented block). Outside a quote a
 * fence stands at most three columns in; the list items the line opens or leaves are kept in
 * `items`. In a quote any fence after the markers opens one, and the lists are not followed.
 */
function opening(
  line: string,
  index: number,
  items: number[],
): { fence: Fence | null; indent: number } {
  if (QUOTED.test(line)) {
    const open = OPEN.exec(line);
    if (!open) return { fence: null, indent: 0 };
    const marks = open[2]!;
    const prefix = open[1]!.replace(/[^\s>]/g, " ");
    return {
      fence: { char: marks[0]!, length: marks.length, prefix, line: index, base: null },
      indent: 0,
    };
  }
  const lead = /^[ \t]*/.exec(line)![0];
  const indent = columns(lead);
  while (items.length > 0 && items[items.length - 1]! > indent) items.pop();
  let base = items[items.length - 1] ?? 0;
  let at = lead.length;
  let column = indent;
  // the list items the line opens, one in another: their content starts after a marker and one
  // to four spaces (one when there are more: the rest is code of the item)
  for (let marker = MARKER.exec(line.slice(at)); marker; marker = MARKER.exec(line.slice(at))) {
    const after = /^[ \t]*/.exec(line.slice(at + marker[0].length))![0];
    const spaces = columns(after);
    const wide = spaces < 1 || spaces > 4;
    column += marker[0].length + (wide ? 1 : spaces);
    at += marker[0].length + (wide ? Math.min(1, after.length) : after.length);
    items.push(column);
    base = column;
  }
  // past a marker the content is measured from the item's own; else from the item it is in
  const space = /^[ \t]*/.exec(line.slice(at))![0];
  const inside = columns(space) + column - base;
  const fence = FENCE.exec(line.slice(at + space.length));
  if (!fence || inside > 3) return { fence: null, indent: inside };
  const marks = fence[1]!;
  const prefix = line.slice(0, at + space.length).replace(/[^\s>]/g, " ");
  return {
    fence: { char: marks[0]!, length: marks.length, prefix, line: index, base },
    indent: inside,
  };
}

/**
 * Whether a line closes the code block of `fence`: its fence characters alone, at least as many,
 * at most three columns past the content of the fence's container. `start`: whether it can be the
 * start of such a line (the last line, still being written).
 */
function closes(line: string, fence: Fence, start = false): boolean {
  const found = (fence.base === null ? QUOTED_CLOSE : CLOSE).exec(line);
  if (!found) return false;
  const marks = found[2]!;
  if (marks[0] !== fence.char) return false;
  if (fence.base !== null && columns(found[1]!) - fence.base > 3) return false;
  return start || marks.length >= fence.length;
}

/** A fence that opens a code block, after the markers of the quotes and list items it is in. */
const OPEN = /^((?:[ \t]*(?:>|[-*+]|\d{1,9}[.)])[ \t]*)*[ \t]*)(`{3,}(?=[^`]*$)|~{3,})/;
/** A fence at the start of a line's content: backticks with none after them, or tildes. */
const FENCE = /^(`{3,}(?=[^`]*$)|~{3,})/;
/** A list item's marker, followed by a space or nothing. */
const MARKER = /^(?:[-*+]|\d{1,9}[.)])(?=[ \t]|\r?$)/;
/** A line in a quote: its first mark is a quote's. */
const QUOTED = /^[ \t]*>/;
/** A line of fence characters alone, after the space before them: one that closes, or its start. */
const CLOSE = /^([ \t]*)(`+|~+)[ \t]*\r?$/;
/** The same in a quote, after its markers. */
const QUOTED_CLOSE = /^([ \t>]*)(`+|~+)[ \t]*\r?$/;
const UNDERLINE = /^ {0,3}(?:-+|=+)[ \t]*\r?$/;
/** What starts a bare address, up to the character whose escape keeps it text. */
const ADDRESS = /https?:(?=\/\/)|www\.|[\w.+-]@/gi;
const SPACE = /\s/;
const PUNCTUATION = /[\p{P}\p{S}]/u;

interface Run {
  char: string;
  at: number;
  length: number;
  opens: boolean;
}

/**
 * Offsets in `tail` (a paragraph's lines) of the marks that open and are not closed in it: the
 * characters to escape. The pairing follows CommonMark's rules for code spans, emphasis and
 * links closely enough to tell an open mark; a mark it leaves alone is read as usual. One pass:
 * what it looks for ahead of a mark (a closing run of backticks, a `>`, the end of a link) is
 * found once for the whole text, not again for every mark.
 */
function openMarks(tail: string): number[] {
  const open: number[] = [];
  const runs: Run[] = [];
  const brackets: number[] = [];
  const before = (at: number) => (at > 0 ? tail[at - 1]! : " ");
  const ahead = lookahead(tail);
  // the backtick runs of a length found closed by none from an offset on: none further on either
  const unclosed = new Map<number, number>();
  // addresses are looked for after the first unfinished link up to the end, so once
  let addresses = false;
  for (let at = 0; at < tail.length; at++) {
    const char = tail[at]!;
    if (char === "\\") {
      at += 1;
    } else if (char === "`") {
      const length = runLength(tail, at);
      const from = at + length;
      const none = unclosed.get(length);
      const close = none !== undefined && from >= none ? -1 : closingTicks(tail, from, length);
      if (close < 0) {
        if (none === undefined) unclosed.set(length, from);
        for (let i = 0; i < length; i++) open.push(at + i);
      }
      at = (close < 0 ? from : close + length) - 1;
    } else if (char === "*" || char === "_" || char === "~") {
      const length = runLength(tail, at);
      const end = at + length;
      const last = end >= tail.length;
      // read alone, the text ends in a space; but it goes on, so a run at its end may still open
      const closes = canClose(char, before(at), last ? " " : tail[end]!);
      const opens = canOpen(char, before(at), last ? "a" : tail[end]!);
      let rest = length;
      while (closes && rest > 0) {
        const opener = lastOpener(runs, char, char === "~" ? rest : 0);
        if (!opener) break;
        const used = char === "~" ? rest : Math.min(2, rest, opener.length);
        runs.length = runs.indexOf(opener) + 1;
        opener.length -= used;
        if (opener.length === 0) runs.pop();
        rest -= used;
      }
      if (opens && rest > 0) runs.push({ char, at: at + length - rest, length: rest, opens });
      at = end - 1;
    } else if (char === "[") {
      brackets.push(at);
    } else if (char === "]") {
      const start = brackets.pop();
      if (start !== undefined && !ahead.linkEnds(at + 1)) {
        open.push(start);
        // an address half written is not a link of its own either
        if (!addresses) {
          addresses = true;
          for (const found of tail.slice(at + 1).matchAll(ADDRESS))
            open.push(at + 1 + found.index + found[0].length - 1);
        }
      }
    } else if (char === "<" && TAG_START.test(tail[at + 1] ?? "") && !ahead.tagEnds(at)) {
      open.push(at);
    }
  }
  for (const run of runs) for (let i = 0; i < run.length; i++) open.push(run.at + i);
  return [...open, ...brackets];
}

/** What starts a tag or an autolink after `<`. */
const TAG_START = /[A-Za-z/!?]/;

/**
 * What stands ahead in a paragraph's lines, each read in one pass: whether a link's text is
 * followed by its finished destination or label, and whether a `<` has its `>` on its line.
 */
function lookahead(text: string) {
  // the offset of the `)` that closes each `(` on its line, nested ones counted
  const closers = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === "\\") i += 1;
    else if (char === "\n") stack.length = 0;
    else if (char === "(") stack.push(i);
    else if (char === ")") {
      const opener = stack.pop();
      if (opener !== undefined) closers.set(opener, i);
    }
  }
  const lastBracket = text.lastIndexOf("]");
  let gt = -1;
  let nl = -1;
  const next = (char: string, from: number) => {
    const found = text.indexOf(char, from);
    return found < 0 ? Number.POSITIVE_INFINITY : found;
  };
  return {
    /**
     * Whether what follows a closing bracket at `at` is finished: a destination or a label that
     * is closed, or other text. At the very end the next character is not known yet: unfinished.
     */
    linkEnds(at: number): boolean {
      if (at >= text.length) return false;
      if (text[at] === "[") return lastBracket >= at;
      if (text[at] !== "(") return true;
      return closers.has(at);
    },
    /** Whether a `<` at `at` has its `>` before its line ends. Asked in the order of the text. */
    tagEnds(at: number): boolean {
      if (gt < at) gt = next(">", at);
      if (nl < at) nl = next("\n", at);
      return gt < nl;
    },
  };
}

function runLength(text: string, at: number): number {
  let end = at;
  while (text[end] === text[at]) end += 1;
  return end - at;
}

/** Start of the run of exactly `length` backticks that closes a code span opened before `from`. */
function closingTicks(text: string, from: number, length: number): number {
  for (let at = text.indexOf("`", from); at >= 0; at = text.indexOf("`", at)) {
    const found = runLength(text, at);
    if (found === length) return at;
    at += found;
  }
  return -1;
}

/** Whether a run between `inner` (the side it would mark) and `outer` flanks towards `inner`. */
function flanks(inner: string, outer: string): boolean {
  if (SPACE.test(inner)) return false;
  return !PUNCTUATION.test(inner) || SPACE.test(outer) || PUNCTUATION.test(outer);
}

/** `_` inside a word marks nothing: it opens or closes only at the word's edge. */
function canOpen(char: string, prev: string, next: string): boolean {
  if (!flanks(next, prev)) return false;
  return char !== "_" || !flanks(prev, next) || PUNCTUATION.test(prev);
}

function canClose(char: string, prev: string, next: string): boolean {
  if (!flanks(prev, next)) return false;
  return char !== "_" || !flanks(next, prev) || PUNCTUATION.test(next);
}

/** The nearest run that can open for a closing one of `char` (of `length` characters, if given). */
function lastOpener(runs: Run[], char: string, length: number): Run | undefined {
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]!;
    if (run.char === char && run.opens && (length === 0 || run.length === length)) return run;
  }
  return undefined;
}
