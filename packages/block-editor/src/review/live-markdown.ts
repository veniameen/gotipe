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
 * Whatever is finished is read as Markdown, and a finished text comes back as it is.
 */
export function settleLiveMarkdown(text: string): string {
  const lines = text.split("\n");
  let fence: Fence | null = null;
  // where the last run of lines without a blank line or a closed code block between starts
  let scope = 0;
  let offset = 0;
  lines.forEach((line, index) => {
    const next = offset + line.length + 1;
    if (fence) {
      const close = CLOSE.exec(line)?.[1];
      if (close && close[0] === fence.char && close.length >= fence.length) {
        fence = null;
        scope = next;
      }
    } else {
      const open = OPEN.exec(line);
      if (open) {
        const marks = open[2]!;
        const prefix = open[1]!.replace(/[^\s>]/g, " ");
        fence = { char: marks[0]!, length: marks.length, prefix, line: index };
      } else if (line.trim() === "") scope = next;
    }
    offset = next;
  });
  const open = fence as Fence | null;
  if (open) {
    // a closing fence half written is not code yet
    const last = lines[lines.length - 1]!;
    const half = open.line < lines.length - 1 && CLOSE.exec(last)?.[1]?.[0] === open.char;
    const body = half ? text.slice(0, text.length - last.length) : text;
    const close = `${open.prefix}${open.char.repeat(open.length)}`;
    return `${body}${body.endsWith("\n") ? "" : "\n"}${close}`;
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
      out += `${text.slice(from, lastLine)}\n`;
      from = lastLine;
    }
    out += `${text.slice(from, at)}\\`;
    from = at;
  }
  if (apart && from <= lastLine) {
    out += `${text.slice(from, lastLine)}\n`;
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

/** An open code block: its fence, what stands before a line inside it, the line it opened on. */
interface Fence {
  char: string;
  length: number;
  prefix: string;
  line: number;
}

/** A fence that opens a code block, after the markers of the quotes and list items it is in. */
const OPEN = /^((?:[ \t]*(?:>|[-*+]|\d{1,9}[.)])[ \t]*)*[ \t]*)(`{3,}(?=[^`]*$)|~{3,})/;
/** A line of fence characters alone: one that closes, or the start of one. */
const CLOSE = /^[ \t>]*(`+|~+)[ \t]*$/;
const UNDERLINE = /^ {0,3}(?:-+|=+)[ \t]*$/;
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
 * links closely enough to tell an open mark; a mark it leaves alone is read as usual.
 */
function openMarks(tail: string): number[] {
  const open: number[] = [];
  const runs: Run[] = [];
  const brackets: number[] = [];
  const before = (at: number) => (at > 0 ? tail[at - 1]! : " ");
  for (let at = 0; at < tail.length; at++) {
    const char = tail[at]!;
    if (char === "\\") {
      at += 1;
    } else if (char === "`") {
      const length = runLength(tail, at);
      const close = closingTicks(tail, at + length, length);
      if (close < 0) for (let i = 0; i < length; i++) open.push(at + i);
      at = (close < 0 ? at + length : close + length) - 1;
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
      if (start !== undefined && !linkEnds(tail, at + 1)) {
        open.push(start);
        // an address half written is not a link of its own either
        for (const found of tail.slice(at + 1).matchAll(ADDRESS))
          open.push(at + 1 + found.index + found[0].length - 1);
      }
    } else if (
      char === "<" &&
      /^[A-Za-z/!?]/.test(tail.slice(at + 1)) &&
      !/^[^\n>]*>/.test(tail.slice(at))
    )
      open.push(at);
  }
  for (const run of runs) for (let i = 0; i < run.length; i++) open.push(run.at + i);
  return [...open, ...brackets];
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

/**
 * Whether what follows a closing bracket at `at` is finished: a destination or a label that is
 * closed, or other text. At the very end the next character is not known yet: unfinished.
 */
function linkEnds(text: string, at: number): boolean {
  if (at >= text.length) return false;
  if (text[at] === "[") return text.indexOf("]", at) >= 0;
  if (text[at] !== "(") return true;
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const char = text[i]!;
    if (char === "\\") i += 1;
    else if (char === "\n") return false;
    else if (char === "(") depth += 1;
    else if (char === ")" && --depth === 0) return true;
  }
  return false;
}
