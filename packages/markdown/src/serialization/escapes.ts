import { emojiEnd } from "../atoms";
import { isAsciiPunct } from "../util";
import type { Unit } from "./inline-types";

/**
 * Step 6 of `writeInline`: the escapes that depend on what is written after a character —
 * typed backslashes, the dollars that would open a formula, the colons that would start a
 * registered custom emoji. Each is decided in linear time in the length of the block (D-96).
 * `crates/gotipe-export/src/markdown/escapes.rs` is the Rust copy.
 */
export function escapeFollowing(
  units: readonly Unit[],
  rend: string[],
  isBreak: (k: number) => boolean,
  emoji: Readonly<Record<string, string>> | undefined,
): void {
  // backslashes (right to left: one is written by the rendering of the next unit)
  for (let k = units.length - 1; k >= 0; k--) {
    const u = units[k]!;
    if (u.k !== "t" || u.ch !== "\\") continue;
    let next: string | null = null;
    if (k + 1 < units.length) {
      if (isBreak(k + 1)) next = "\n";
      else {
        const s = rend[k + 1] ?? "";
        next = s === "" ? null : s[0]!;
      }
    }
    rend[k] = next === null || next === "\n" || isAsciiPunct(next) ? "\\\\" : "\\";
  }
  escapeDollars(units, rend, isBreak);
  if (emoji) escapeColons(units, rend, isBreak, emoji);
}

const space = (c: string | undefined): boolean =>
  c === " " || c === "\t" || c === "\n" || c === "\r";

/**
 * Dollars, right to left: a typed `$` that would open a formula for a reader of inline formulas
 * is escaped; `$5 and $6` stays as typed. The rest of the line is read as `mathEnd` reads it
 * after a `$`: kept backwards as it is decided, with, for each character, where the first `$`
 * that no backslash escapes stands from it.
 */
function escapeDollars(
  units: readonly Unit[],
  rend: string[],
  isBreak: (k: number) => boolean,
): void {
  // the rest of the line, last character first, and for each the index of the `$` reading
  // stops at from there (-1: none on the line)
  let chars: string[] = [];
  let stops: number[] = [];
  const write = (written: string): void => {
    for (let i = written.length - 1; i >= 0; i--) {
      const c = written[i]!;
      const j = chars.length;
      let stop = -1;
      if (c === "$") stop = j;
      else if (c === "\\") stop = chars[j - 1] === "\n" ? -1 : (stops[j - 2] ?? -1);
      else if (c !== "\n") stop = stops[j - 1] ?? -1;
      chars.push(c);
      stops.push(stop);
    }
  };
  const typedDollar = (k: number): boolean => {
    const u = units[k];
    return u?.k === "t" && u.ch === "$";
  };
  for (let k = units.length - 1; k >= 0; k--) {
    if (isBreak(k)) {
      chars = [];
      stops = [];
      continue;
    }
    if (!typedDollar(k)) {
      write(rend[k]!);
      continue;
    }
    let from = k;
    while (typedDollar(from - 1)) from--;
    const top = chars.length - 1;
    const first = chars[top];
    const stop = top >= 0 && first !== "$" && !space(first) ? stops[top]! : -1;
    // `mathEnd` after a `$` alone: the `$` it stops at follows no blank and is followed by
    // no digit. Two or more typed dollars in a row are text for the reader as well, unless
    // the `$` of a formula follows them: joined with it they would make the formula text.
    const formula =
      from === k && stop >= 0 && !space(chars[stop + 1]) && !/[0-9]/.test(chars[stop - 1] ?? "");
    if (first === "$" || formula) for (let q = from; q <= k; q++) rend[q] = "\\$";
    for (let q = k; q >= from; q--) write(rend[q]!);
    k = from;
  }
}

/**
 * Where a word holds the start of an address: a scheme and `://`, or `www.` (`URL_WORD`).
 * `letter`: the run of scheme characters before here holds a letter; `colon`: how much of `://`
 * follows that run.
 */
class UrlWord {
  found = false;
  private letter = false;
  private colon = 0;
  private tail = "";

  push(c: string): void {
    if (/[ \t\n\r\f\v]/.test(c)) {
      this.found = false;
      this.letter = false;
      this.colon = 0;
      this.tail = "";
      return;
    }
    if (this.colon > 0 && c === "/") this.colon++;
    else this.colon = c === ":" && this.letter ? 1 : 0;
    if (this.colon === 3) this.found = true;
    if (/[A-Za-z0-9+.-]/.test(c)) this.letter ||= /[A-Za-z]/.test(c);
    else this.letter = false;
    this.tail = (this.tail + c).slice(-4);
    if (this.tail === "www.") this.found = true;
  }
}

/**
 * Colons, left to right: typed `:name:` of a registered custom emoji is escaped, as a reader of
 * custom emoji would take it for one. `emojiEnd` looks back at the character before the colon
 * and at the word it ends; both are kept as the line is written.
 */
function escapeColons(
  units: readonly Unit[],
  rend: string[],
  isBreak: (k: number) => boolean,
  emoji: Readonly<Record<string, string>>,
): void {
  let word = new UrlWord();
  let last = "";
  for (let k = 0; k < units.length; k++) {
    if (isBreak(k)) {
      word = new UrlWord();
      last = "";
      continue;
    }
    const u = units[k]!;
    if (u.k === "t" && u.ch === ":" && rend[k] === ":" && !word.found) {
      let rest = "";
      for (let q = k + 1; q < units.length && !isBreak(q) && rest.length < 100; q++)
        rest += rend[q];
      if (emojiEnd(`${last}:${rest}`, last.length, emoji) > 0) rend[k] = "\\:";
    }
    for (const c of rend[k] ?? "") {
      word.push(c);
      last = /[ \t\n\r\f\v]/.test(c) ? "" : c;
    }
  }
}
