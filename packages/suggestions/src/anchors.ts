/**
 * Text anchors in the ADR-0047 format: an edit names its place by the text
 * around it — `before + quote + after` must occur exactly once in the current
 * text. `quote` is the text being replaced (empty = insertion), `text` the
 * replacement (empty = deletion).
 */
export interface TextAnchor {
  before: string;
  quote: string;
  after: string;
}

export interface AnchoredEdit extends TextAnchor {
  text: string;
}

export type AnchorFailure = "missing" | "ambiguous";

export type AnchorMatch =
  | { ok: true; start: number; end: number }
  | { ok: false; reason: AnchorFailure };

/** Positions in `text` where `needle` starts (overlapping matches included, at most `limit`). */
function occurrences(text: string, needle: string, limit = 2): number[] {
  const out: number[] = [];
  if (needle === "") return text === "" ? [0] : [0, 1]; // matches everywhere
  let from = 0;
  while (out.length < limit) {
    const at = text.indexOf(needle, from);
    if (at === -1) break;
    out.push(at);
    from = at + 1;
  }
  return out;
}

/** CRLF text seen through LF eyes: the LF text and a map back to original offsets. */
function lfView(text: string): { lf: string; toOriginal: (i: number) => number } | null {
  if (!text.includes("\r\n")) return null;
  const positions: number[] = [];
  let lf = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\r" && text[i + 1] === "\n") continue;
    positions.push(i);
    lf += text[i];
  }
  positions.push(text.length);
  return { lf, toOriginal: (i) => positions[i] ?? text.length };
}

/**
 * Finds the quote of `anchor` in `text`. The whole `before + quote + after`
 * must match exactly once. CRLF files accept LF anchors.
 */
export function findAnchor(text: string, anchor: TextAnchor): AnchorMatch {
  const needle = anchor.before + anchor.quote + anchor.after;
  const hits = occurrences(text, needle);
  if (hits.length === 1) {
    const start = hits[0]! + anchor.before.length;
    return { ok: true, start, end: start + anchor.quote.length };
  }
  if (hits.length > 1) return { ok: false, reason: "ambiguous" };
  if (!needle.includes("\r")) {
    const view = lfView(text);
    if (view) {
      const lfHits = occurrences(view.lf, needle);
      if (lfHits.length === 1) {
        const start = lfHits[0]! + anchor.before.length;
        return {
          ok: true,
          start: view.toOriginal(start),
          end: view.toOriginal(start + anchor.quote.length),
        };
      }
      if (lfHits.length > 1) return { ok: false, reason: "ambiguous" };
    }
  }
  return { ok: false, reason: "missing" };
}

export interface LocatedEdit {
  index: number;
  start: number;
  end: number;
  text: string;
}

export type LocateResult =
  | { ok: true; edits: LocatedEdit[] }
  | { ok: false; reason: AnchorFailure | "overlap"; index: number };

/** True when two located edits touch the same text (two inserts at one point overlap too). */
export function editsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  if (a.start === a.end && b.start === b.end) return a.start === b.start;
  if (a.start === a.end) return a.start > b.start && a.start < b.end;
  if (b.start === b.end) return b.start > a.start && b.start < a.end;
  return a.start < b.end && b.start < a.end;
}

/** Locates every edit; fails on the first missing/ambiguous anchor or on overlapping edits. */
export function locateEdits(text: string, edits: AnchoredEdit[]): LocateResult {
  const located: LocatedEdit[] = [];
  for (let index = 0; index < edits.length; index++) {
    const edit = edits[index]!;
    const match = findAnchor(text, edit);
    if (!match.ok) return { ok: false, reason: match.reason, index };
    located.push({ index, start: match.start, end: match.end, text: edit.text });
  }
  const sorted = [...located].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < sorted.length; i++) {
    if (editsOverlap(sorted[i - 1]!, sorted[i]!))
      return { ok: false, reason: "overlap", index: sorted[i]!.index };
  }
  return { ok: true, edits: sorted };
}

export type ApplyResult =
  | { ok: true; text: string }
  | { ok: false; reason: AnchorFailure | "overlap"; index: number };

/**
 * Applies anchored edits to `text` (all or nothing). The basis of «Принять»:
 * a stale anchor leaves the text untouched.
 */
export function applyAnchoredEdits(text: string, edits: AnchoredEdit[]): ApplyResult {
  const located = locateEdits(text, edits);
  if (!located.ok) return located;
  let out = text;
  for (let i = located.edits.length - 1; i >= 0; i--) {
    const e = located.edits[i]!;
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return { ok: true, text: out };
}

/**
 * Whether `edit` changes text inside the anchor window of `other`
 * (accepting one would make the other stale). ADR-0047 «задевает».
 */
export function anchorWindowsOverlap(text: string, edit: AnchoredEdit, other: TextAnchor): boolean {
  const a = findAnchor(text, edit);
  const b = findAnchor(text, other);
  if (!a.ok || !b.ok) return false;
  const windowStart = b.start - other.before.length;
  const windowEnd = b.end + other.after.length;
  return a.start < windowEnd && a.end > windowStart;
}

/** Builds an anchor for `[start, end)` of `text` with up to `context` chars on each side, unique if possible. */
export function anchorAt(text: string, start: number, end: number, context = 40): TextAnchor {
  const quote = text.slice(start, end);
  let size = Math.min(context, 8);
  for (;;) {
    const anchor = {
      before: text.slice(Math.max(0, start - size), start),
      quote,
      after: text.slice(end, end + size),
    };
    const match = findAnchor(text, anchor);
    if (match.ok || size >= context || (start - size <= 0 && end + size >= text.length))
      return anchor;
    size = Math.min(context, size * 2);
  }
}
