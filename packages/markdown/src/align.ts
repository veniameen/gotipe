import type { RawSegment } from "./types";
import { isAsciiPunct } from "./util";

/**
 * Alignment of mdast node values to their Markdown source, used to build
 * text <-> markdown segments for blocks that are kept verbatim.
 *
 * Modes:
 * - `text`: backslash escapes, character references, soft line breaks: trailing whitespace +
 *   line ending + stripped continuation prefix, which the reader makes a space (D-88).
 * - `code`: inline code (a line ending, read as a space, + continuation prefix).
 * - `cellCode`: inline code inside a GFM table cell (`\|` -> `|`).
 */
export type AlignMode = "text" | "code" | "cellCode";

interface Move {
  ni: number;
  nj: number;
  mf: number;
  mt: number;
  exact: boolean;
}

const CHAR_REF_RE = /&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z][A-Za-z0-9]{1,31}));/y;

function isEolCode(c: number): boolean {
  return c === 10 || c === 13;
}

function decodeNumeric(hex: string | undefined, dec: string | undefined): string {
  const cp = hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(dec ?? "0", 10);
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return "�";
  return String.fromCodePoint(cp);
}

export interface AlignOptions {
  /** Accept any unmatched source after the value (positionless runs). */
  looseEnd?: boolean;
}

/**
 * Align `value` against `src.slice(from, to)`. Returns segments with text offsets
 * relative to `value` and absolute md offsets, or null when no alignment is found.
 */
export function align(
  value: string,
  src: string,
  from: number,
  to: number,
  mode: AlignMode,
  options: AlignOptions = {},
): RawSegment[] | null {
  const budget = (to - from + value.length) * 6 + 200;
  const path: Move[] = [];
  const stack: { alts: Move[]; k: number; pathLen: number }[] = [];
  let i = 0;
  let j = from;
  let steps = 0;

  const done = (): boolean => {
    if (i !== value.length) return false;
    if (j === to || options.looseEnd) return true;
    for (let k = j; k < to; k++) {
      const c = src.charCodeAt(k);
      if (c !== 32 && c !== 9) return false;
    }
    return mode === "text";
  };

  const candidates = (): Move[] => {
    const out: Move[] = [];
    if (i >= value.length || j >= to) return out;
    const v = value[i]!;
    const s = src[j]!;
    if (mode === "text") {
      if (s === "\\" && j + 1 < to && isAsciiPunct(src[j + 1]) && v === src[j + 1]) {
        out.push({ ni: i + 1, nj: j + 2, mf: j, mt: j + 2, exact: false });
      }
      if (s === "&") {
        CHAR_REF_RE.lastIndex = j;
        const m = CHAR_REF_RE.exec(src);
        if (m && j + m[0].length <= to) {
          const len = m[0].length;
          if (m[3] === undefined) {
            const decoded = decodeNumeric(m[1], m[2]);
            if (value.startsWith(decoded, i)) {
              out.push({ ni: i + decoded.length, nj: j + len, mf: j, mt: j + len, exact: false });
            }
          } else {
            // Named reference: decoded value is 1 or 2 code points.
            let k = i;
            for (let n = 0; n < 2 && k < value.length; n++) {
              const cp = value.codePointAt(k)!;
              k += cp > 0xffff ? 2 : 1;
              out.push({ ni: k, nj: j + len, mf: j, mt: j + len, exact: false });
            }
          }
        }
      }
      if (v === "\n" || v === " ") pushLineEnding(out, true);
    } else {
      if (mode === "cellCode" && s === "\\" && src[j + 1] === "|" && v === "|" && j + 1 < to) {
        out.push({ ni: i + 1, nj: j + 2, mf: j, mt: j + 2, exact: false });
      }
      if (v === "\n" || v === " ") pushLineEnding(out, false);
    }
    if (s === v) out.push({ ni: i + 1, nj: j + 1, mf: j, mt: j + 1, exact: true });
    return out;
  };

  const pushLineEnding = (out: Move[], skipTrailingWs: boolean): void => {
    let k = j;
    if (skipTrailingWs) {
      while (k < to && (src[k] === " " || src[k] === "\t")) k++;
    }
    if (k >= to || !isEolCode(src.charCodeAt(k))) return;
    let e = k + 1;
    if (src.charCodeAt(k) === 13 && src.charCodeAt(e) === 10) e++;
    let p = e;
    while (p < to && (src[p] === " " || src[p] === "\t" || src[p] === ">")) p++;
    const exact = value[i] === "\n" && e - j === 1 && src[j] === "\n";
    for (let q = p; q >= e; q--) {
      out.push({ ni: i + 1, nj: q, mf: j, mt: e, exact: exact && q === e });
    }
  };

  for (;;) {
    if (steps++ > budget) return null;
    if (done()) return buildSegments(path);
    const alts = candidates();
    if (alts.length > 0) {
      stack.push({ alts, k: 0, pathLen: path.length });
      const m = alts[0]!;
      path.push(m);
      i = m.ni;
      j = m.nj;
      continue;
    }
    let resumed = false;
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      top.k++;
      if (top.k < top.alts.length) {
        path.length = top.pathLen;
        const m = top.alts[top.k]!;
        path.push(m);
        i = m.ni;
        j = m.nj;
        resumed = true;
        break;
      }
      stack.pop();
    }
    if (!resumed) return null;
  }
}

function buildSegments(path: Move[]): RawSegment[] {
  const segs: RawSegment[] = [];
  let ti = 0;
  for (const m of path) {
    const prev = segs[segs.length - 1];
    if (m.exact && prev && prev.exact && prev.textTo === ti && prev.mdTo === m.mf) {
      prev.textTo = m.ni;
      prev.mdTo = m.mt;
    } else {
      segs.push({ textFrom: ti, textTo: m.ni, mdFrom: m.mf, mdTo: m.mt, exact: m.exact });
    }
    ti = m.ni;
  }
  return segs;
}

/**
 * Align with up to `maxSkip` unmatched source chars before the value
 * (used for nodes without positions, e.g. GFM autolink literals).
 */
export function alignLoose(
  value: string,
  src: string,
  from: number,
  to: number,
  maxSkip: number,
): RawSegment[] | null {
  for (let s = 0; s <= maxSkip && from + s <= to; s++) {
    const r = align(value, src, from + s, to, "text", { looseEnd: true });
    if (r) return r;
  }
  return null;
}

/** Segments for an inline code node given the full source slice `[from, to)` (with fences). */
export function alignInlineCode(
  value: string,
  src: string,
  from: number,
  to: number,
  inCell: boolean,
): RawSegment[] | null {
  let n = 0;
  while (from + n < to && src[from + n] === "`") n++;
  let m = 0;
  while (to - m - 1 > from + n && src[to - m - 1] === "`") m++;
  const innerFrom = from + n;
  const innerTo = to - m;
  if (innerFrom > innerTo) return null;
  const mode: AlignMode = inCell ? "cellCode" : "code";
  return (
    align(value, src, innerFrom, innerTo, mode) ??
    (innerTo - innerFrom >= 2 ? align(value, src, innerFrom + 1, innerTo - 1, mode) : null)
  );
}

/**
 * Segments for a code block: each value line must be a suffix of its source line
 * (container prefixes and fence indentation are stripped from the start only).
 * `value` uses "\n" line breaks.
 */
export function alignCodeBlock(
  value: string,
  src: string,
  from: number,
  to: number,
  fenced: boolean,
): RawSegment[] | null {
  // Split source lines of [from, to).
  const lines: { start: number; end: number; eolEnd: number }[] = [];
  let p = from;
  while (p <= to) {
    let e = p;
    while (e < to && !isEolCode(src.charCodeAt(e))) e++;
    let n = e;
    if (n < to) {
      n++;
      if (src.charCodeAt(e) === 13 && src.charCodeAt(n) === 10 && n < to) n++;
    }
    lines.push({ start: p, end: e, eolEnd: n });
    if (n === e) break;
    p = n;
  }
  const valueLines = value.split("\n");
  const first = fenced ? 1 : 0;
  if (fenced && value === "" && lines.length <= 2) return [];
  if (lines.length < first + valueLines.length) return null;
  const segs: RawSegment[] = [];
  let ti = 0;
  for (let k = 0; k < valueLines.length; k++) {
    const vl = valueLines[k]!;
    const line = lines[first + k]!;
    const text = src.slice(line.start, line.end);
    if (!text.endsWith(vl)) return null;
    if (vl.length > 0) {
      segs.push({
        textFrom: ti,
        textTo: ti + vl.length,
        mdFrom: line.end - vl.length,
        mdTo: line.end,
        exact: true,
      });
    }
    ti += vl.length;
    if (k < valueLines.length - 1) {
      const eol = src.slice(line.end, line.eolEnd);
      segs.push({
        textFrom: ti,
        textTo: ti + 1,
        mdFrom: line.end,
        mdTo: line.eolEnd,
        exact: eol === "\n",
      });
      ti += 1;
    }
  }
  return segs;
}
