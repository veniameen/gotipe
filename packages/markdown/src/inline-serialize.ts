import { normalizeSpans } from "./model";
import type { InlineOptions, Unit } from "./serialization/inline-types";
import { inlineUnits } from "./serialization/inline-units";
import type { RawSegment, Span } from "./types";
import { classify, isAsciiPunct } from "./util";
export { linkDestination, linkTitle } from "./serialization/inline-units";
export type { InlineKind, InlineOptions } from "./serialization/inline-types";

const ENTITY_LOOKAHEAD = /^&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/;
const THEMATIC_RE = /^([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
/** A line that could be a GFM table delimiter row (turns the previous line into a table header). */
const DELIM_ROW_RE = /^:?-+:?[ \t]*(?:\||$)/;

/** Can a "\n" inside an inline code span be written as a real line break before `rest`? */
function codeBreakOk(rest: string): boolean {
  const nextPart = rest.split("\n", 1)[0] ?? "";
  return /^[ \t]*(?:\p{L}|\p{N}(?!\p{N}*[.)]))/u.test(nextPart);
}

/**
 * Serialize rich text. Returns Markdown and segments (text offsets relative to the
 * block text, md offsets relative to the returned string).
 */
export function writeInline(
  spansIn: readonly Span[],
  o: InlineOptions,
): { md: string; segs: RawSegment[] } {
  const spans = normalizeSpans(spansIn);
  const units = inlineUnits(spans, o);
  const n = units.length;
  const lineKinds = o.kind === "block" || o.kind === "midline";

  // 1. newline modes
  const nlMode: (string | null)[] = new Array(n).fill(null);
  const contentAfter: boolean[] = new Array(n + 1).fill(false);
  for (let k = n - 1; k >= 0; k--) {
    const u = units[k]!;
    contentAfter[k] = contentAfter[k + 1]! || u.k === "t" || u.k === "lit" || u.k === "code";
  }
  {
    // A line break is only written when the current line already has text (not just
    // delimiters/tags: `<em>` alone on a line would start an HTML block) and more
    // text follows. An initial "\n" is always encoded, also in `midline` content.
    let lineHasContent = false;
    for (let k = 0; k < n; k++) {
      const u = units[k]!;
      if (u.k !== "nl") {
        if (u.k === "t" || u.k === "lit" || u.k === "code") lineHasContent = true;
        continue;
      }
      if (o.kind === "heading" || o.kind === "cell") nlMode[k] = "br";
      else if (o.kind === "alt") nlMode[k] = "space";
      else if (lineHasContent && contentAfter[k + 1]) {
        nlMode[k] = "newline";
        lineHasContent = false;
        continue;
      } else nlMode[k] = "entity";
      lineHasContent = true;
    }
  }
  const isBreak = (k: number): boolean => units[k]?.k === "nl" && nlMode[k] === "newline";
  const multiline = lineKinds && nlMode.some((m) => m === "newline");

  // 2. line structure
  const lineIdx: number[] = new Array(n).fill(0);
  const atLineStart: boolean[] = new Array(n).fill(false);
  const lineStartOf: number[] = new Array(n).fill(0);
  {
    let line = 0;
    let start = true;
    let startIdx = 0;
    for (let k = 0; k < n; k++) {
      if (start) startIdx = k;
      lineIdx[k] = line;
      atLineStart[k] = start;
      lineStartOf[k] = startIdx;
      start = false;
      if (isBreak(k)) {
        line++;
        start = true;
      }
    }
  }
  const stripsLeading = (k: number): boolean => {
    if (!atLineStart[k]) return false;
    if (o.kind === "alt") return false;
    if (o.kind === "midline") return lineIdx[k]! > 0;
    return true;
  };
  const blockRules = (k: number): boolean =>
    atLineStart[k]! && (o.kind === "block" || (o.kind === "midline" && lineIdx[k]! > 0));

  // 3. whitespace that must be encoded
  const wsEnt: boolean[] = new Array(n).fill(false);
  for (let k = 0; k < n; k++) {
    const u = units[k]!;
    if (u.k !== "t" || (u.ch !== " " && u.ch !== "\t")) continue;
    if (stripsLeading(k)) wsEnt[k] = true;
    else if (o.kind !== "alt" && (k === n - 1 || isBreak(k + 1))) wsEnt[k] = true;
  }

  // Raw/representative first and last chars of non-text units.
  const unitFixed = (k: number): string | null => {
    const u = units[k]!;
    switch (u.k) {
      case "syn":
        return u.s;
      case "lit":
        return u.s;
      case "code":
        return u.s;
      case "emo":
        return u.pair.tag ? (u.open ? u.pair.openTag : u.pair.closeTag) : u.pair.delim;
      case "nl": {
        const m = nlMode[k];
        return m === "newline" ? "\n" : m === "entity" ? "&#10;" : m === "br" ? "<br>" : " ";
      }
      default:
        return null;
    }
  };
  const classAt = (k: number, side: "first" | "last"): 0 | 1 | 2 => {
    if (k < 0 || k >= n) return 1;
    const u = units[k]!;
    if (u.k === "emo") return 2;
    if (u.k === "t") return wsEnt[k] ? 2 : classify(u.ch);
    if (u.k === "nl") {
      const m = nlMode[k];
      return m === "newline" || m === "space" ? 1 : 2;
    }
    const s = unitFixed(k) ?? "";
    if (s === "") return 1;
    const ch = side === "first" ? String.fromCodePoint(s.codePointAt(0)!) : Array.from(s).pop()!;
    return classify(ch);
  };

  // 4. emphasis delimiters vs tags. Adjacent delimiters of the same char form one
  // delimiter run, so flanking is checked per run; a run mixing closers and openers
  // (e.g. `*a***b**`) is ambiguous: its openers fall back to tags. Iterate to a fixpoint
  // (a pair switched to tags changes the runs around it).
  if (o.tier >= 2) {
    for (const u of units) if (u.k === "emo") u.pair.tag = true;
  } else {
    let changed = true;
    let guard = 0;
    while (changed && guard++ < n + 2) {
      changed = false;
      let k = 0;
      while (k < n) {
        const u = units[k]!;
        if (u.k !== "emo" || u.pair.tag) {
          k++;
          continue;
        }
        const ch = u.pair.delim[0];
        let e = k;
        while (e < n) {
          const v = units[e]!;
          if (v.k !== "emo" || v.pair.tag || v.pair.delim[0] !== ch) break;
          e++;
        }
        const run = units.slice(k, e) as Extract<Unit, { k: "emo" }>[];
        const before = classAt(k - 1, "last");
        const after = classAt(e, "first");
        const hasClose = run.some((r) => !r.open);
        const left = after !== 1 && (after !== 2 || before !== 0);
        const right = before !== 1 && (before !== 2 || after !== 0);
        for (const r of run) {
          const bad = r.open ? hasClose || !left : !right;
          if (bad && !r.pair.tag) {
            r.pair.tag = true;
            changed = true;
          }
        }
        k = e;
      }
    }
  }

  // 5. decide text renderings (left to right)
  const rend: string[] = new Array(n).fill("");
  for (let k = 0; k < n; k++) {
    const u = units[k]!;
    if (u.k === "code") rend[k] = renderCode(u.s, o).s;
    else if (u.k !== "t") rend[k] = unitFixed(k) ?? "";
  }
  const lineRest = (k: number): string => {
    let s = "";
    for (let q = k; q < n && !isBreak(q); q++) {
      const u = units[q]!;
      s += u.k === "t" ? u.ch : rend[q];
      if (s.length > 200) break;
    }
    return s;
  };
  const nextIsWs = (k: number): boolean => {
    if (k + 1 >= n) return true;
    const u = units[k + 1]!;
    if (u.k === "t") return (u.ch === " " || u.ch === "\t") && !wsEnt[k + 1];
    if (u.k === "nl") return nlMode[k + 1] === "newline" || nlMode[k + 1] === "space";
    return false;
  };
  const nextFirst = (k: number): string | null => {
    if (k + 1 >= n) return null;
    const u = units[k + 1]!;
    if (u.k === "t") return u.ch;
    const s = rend[k + 1] ?? "";
    return s === "" ? null : String.fromCodePoint(s.codePointAt(0)!);
  };
  let lineSoFar = "";
  let out = "";
  for (let k = 0; k < n; k++) {
    const u = units[k]!;
    if (u.k !== "t") {
      if (isBreak(k)) {
        lineSoFar = "";
        out += "\n";
      } else {
        lineSoFar += rend[k];
        out += rend[k];
      }
      continue;
    }
    const prevChar = atLineStart[k]
      ? null
      : out.length > 0
        ? Array.from(out.slice(-2)).pop()!
        : null;
    const prevWs = prevChar === null || classify(prevChar) === 1;
    const c = u.ch;
    let mode: "lit" | "esc" | "ent" = "lit";
    const bs = blockRules(k);
    switch (c) {
      case " ":
      case "\t":
        mode = wsEnt[k] ? "ent" : "lit";
        break;
      case "`":
      case "[":
      case "]":
        mode = "esc";
        break;
      case "*":
        if (bs && (nextIsWs(k) || THEMATIC_RE.test(lineRest(k)))) mode = "esc";
        else mode = prevWs && nextIsWs(k) ? "lit" : "esc";
        break;
      case "_": {
        if (bs && THEMATIC_RE.test(lineRest(k))) mode = "esc";
        else if (prevWs && nextIsWs(k)) mode = "lit";
        else {
          const nx = nextFirst(k);
          const nextIsText = units[k + 1]?.k === "t" && !wsEnt[k + 1];
          mode =
            prevChar !== null &&
            classify(prevChar) === 0 &&
            nx !== null &&
            nextIsText &&
            classify(nx) === 0
              ? "lit"
              : "esc";
        }
        break;
      }
      case "~":
        mode = prevWs && nextIsWs(k) && !(bs && lineRest(k).startsWith("~~~")) ? "lit" : "esc";
        break;
      case "<": {
        const nx = nextFirst(k);
        mode = nx !== null && /[A-Za-z/!?]/.test(nx) ? "esc" : "lit";
        break;
      }
      case ">":
        mode = bs ? "esc" : "lit";
        break;
      case "#":
        if (bs && /^#{1,6}(?:[ \t]|$)/.test(lineRest(k))) mode = "esc";
        else if (o.kind === "heading" && prevWs && /^#+$/.test(lineRest(k))) mode = "esc";
        break;
      case "-":
        if (
          bs &&
          (nextIsWs(k) ||
            THEMATIC_RE.test(lineRest(k)) ||
            ((lineIdx[k]! > 0 || o.continuation === true) &&
              (/^-+[ \t]*$/.test(lineRest(k)) || DELIM_ROW_RE.test(lineRest(k)))))
        )
          mode = "esc";
        break;
      case "+":
        if (bs && nextIsWs(k)) mode = "esc";
        break;
      case "=":
        if (bs && (lineIdx[k]! > 0 || o.continuation === true) && /^=+[ \t]*$/.test(lineRest(k))) {
          mode = "esc";
        }
        break;
      case ".":
      case ")": {
        if (blockRules(lineStartOf[k]!) && /^\d{1,9}$/.test(lineSoFar) && nextIsWs(k)) {
          mode = "esc";
        }
        break;
      }
      case "&": {
        let look = "&";
        for (let q = k + 1; q < n && look.length < 40; q++) {
          const uq = units[q]!;
          if (uq.k === "t") look += uq.ch;
          else if (uq.k === "lit") look += uq.s;
          else break;
        }
        mode = ENTITY_LOOKAHEAD.test(look) ? "esc" : "lit";
        break;
      }
      case "!":
        mode = nextFirst(k) === "[" && units[k + 1]?.k !== "t" ? "esc" : "lit";
        break;
      case ":":
        if (bs && (lineIdx[k]! > 0 || o.continuation === true) && DELIM_ROW_RE.test(lineRest(k))) {
          mode = "esc";
        } else mode = prevChar === "]" && units[k - 1]?.k !== "t" ? "esc" : "lit";
        break;
      case "(":
        // `](` after verbatim `[x]` would form a link; text `]` is always escaped.
        mode = prevChar === "]" && units[k - 1]?.k !== "t" ? "esc" : "lit";
        break;
      case "|":
        mode = o.kind === "cell" || multiline ? "esc" : "lit";
        break;
      default:
        mode = "lit";
    }
    rend[k] =
      mode === "lit" ? c : mode === "esc" ? `\\${c}` : `&#${c.codePointAt(0)!.toString(10)};`;
    lineSoFar += rend[k];
    out += rend[k];
  }

  // 6. backslashes (right to left: depends on the rendering of the next unit)
  for (let k = n - 1; k >= 0; k--) {
    const u = units[k]!;
    if (u.k !== "t" || u.ch !== "\\") continue;
    let next: string | null = null;
    if (k + 1 < n) {
      if (isBreak(k + 1)) next = "\n";
      else {
        const s = rend[k + 1] ?? "";
        next = s === "" ? null : s[0]!;
      }
    }
    rend[k] = next === null || next === "\n" || isAsciiPunct(next) ? "\\\\" : "\\";
  }

  // 7. render with segments
  let md = "";
  const segs: RawSegment[] = [];
  const addSeg = (tf: number, tt: number, mf: number, mt: number, exact: boolean): void => {
    const prev = segs[segs.length - 1];
    if (exact && prev && prev.exact && prev.textTo === tf && prev.mdTo === mf) {
      prev.textTo = tt;
      prev.mdTo = mt;
      return;
    }
    segs.push({ textFrom: tf, textTo: tt, mdFrom: mf, mdTo: mt, exact });
  };
  for (let k = 0; k < n; k++) {
    const u = units[k]!;
    const pos = md.length;
    switch (u.k) {
      case "t": {
        const r = rend[k]!;
        md += r;
        addSeg(u.ti, u.ti + u.ch.length, pos, pos + r.length, r === u.ch);
        break;
      }
      case "nl": {
        const m = nlMode[k];
        if (m === "newline") {
          const r = (o.hard ? "\\" : "") + o.newline;
          md += r;
          const mapped = (o.hard ? 1 : 0) + o.eol.length;
          addSeg(u.ti, u.ti + 1, pos, pos + mapped, !o.hard && o.eol === "\n");
        } else {
          const r = rend[k]!;
          md += r;
          addSeg(u.ti, u.ti + 1, pos, pos + r.length, false);
        }
        break;
      }
      case "lit":
        md += u.s;
        if (u.s.length > 0) addSeg(u.ti, u.ti + u.s.length, pos, pos + u.s.length, true);
        break;
      case "code": {
        const r = renderCode(u.s, o);
        md += r.s;
        for (const s of r.segs) {
          addSeg(u.ti + s.textFrom, u.ti + s.textTo, pos + s.mdFrom, pos + s.mdTo, s.exact);
        }
        break;
      }
      default:
        md += rend[k];
    }
  }
  return { md, segs };
}

function renderCode(text: string, o: InlineOptions): { s: string; segs: RawSegment[] } {
  let s = "";
  const segs: RawSegment[] = [];
  const lineKinds = o.kind === "block" || o.kind === "midline";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const pos = s.length;
    if (c === "\n") {
      if (lineKinds && codeBreakOk(text.slice(i + 1))) {
        s += o.newline;
        segs.push({
          textFrom: i,
          textTo: i + 1,
          mdFrom: pos,
          mdTo: pos + o.eol.length,
          exact: o.eol === "\n",
        });
      } else {
        s += " ";
        segs.push({ textFrom: i, textTo: i + 1, mdFrom: pos, mdTo: pos + 1, exact: false });
      }
      continue;
    }
    if (c === "|" && o.kind === "cell") {
      s += "\\|";
      segs.push({ textFrom: i, textTo: i + 1, mdFrom: pos, mdTo: pos + 2, exact: false });
      continue;
    }
    s += c;
    const prev = segs[segs.length - 1];
    if (prev?.exact && prev.textTo === i && prev.mdTo === pos) {
      prev.textTo = i + 1;
      prev.mdTo = pos + 1;
    } else segs.push({ textFrom: i, textTo: i + 1, mdFrom: pos, mdTo: pos + 1, exact: true });
  }
  return { s, segs };
}
