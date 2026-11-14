// The ranking of the docs search: plain functions over the static index, run in the browser.
// A title outweighs a heading, a heading the text under it; a whole word outweighs a prefix and a
// prefix a match inside a word. Every word of the query must match somewhere in the entry.
// Lower case is locale-free and keeps the length, so Cyrillic matches and highlights line up.

export interface SearchEntry {
  /** A page, or one heading of a page. */
  k: "page" | "heading";
  /** The section of nav.json. */
  s: string;
  /** The page's title. */
  p: string;
  /** The entry's title: the page's or the heading's. */
  t: string;
  /** The page's description (pages only). */
  d: string;
  /** Prose under the entry: its paragraphs, items and cells, each a segment of its own. */
  x: string[];
  /** The address. */
  u: string;
}

export type Range = [start: number, end: number];

export interface SearchHit {
  entry: SearchEntry;
  score: number;
  titleRanges: Range[];
  /** One line to show under the title, and where the query is in it. */
  detail: string;
  detailRanges: Range[];
}

export interface SearchGroup {
  section: string;
  hits: SearchHit[];
}

/** Same length as the input: `ё` reads as `е`, case folds without a locale. */
export const fold = (text: string) => text.toLowerCase().replace(/ё/g, "е");

export const queryWords = (query: string) =>
  fold(query)
    .split(/[\s,;:()[\]{}"'`]+/)
    .filter(Boolean);

const LETTER = /[\p{L}\p{N}]/u;

/** Starts a word: after a non-letter, or at a lower-to-upper step of camelCase in the original. */
function wordStart(original: string, at: number): boolean {
  if (at === 0) return true;
  const before = original[at - 1]!;
  if (!LETTER.test(before)) return true;
  const here = original[at]!;
  return before === before.toLowerCase() && here !== here.toLowerCase();
}

/** How well `word` matches `text`: 4 the whole text, 3 a prefix, 2 a word start, 1 inside, 0 not. */
function quality(text: string, folded: string, word: string): number {
  if (folded === word) return 4;
  if (folded.startsWith(word)) return 3;
  let at = folded.indexOf(word);
  let best = 0;
  while (at !== -1) {
    best = Math.max(best, wordStart(text, at) ? 2 : 1);
    if (best === 2) break;
    at = folded.indexOf(word, at + 1);
  }
  return best;
}

const TITLE = [0, 30, 60, 80, 120];
const PAGE = [0, 6, 10, 12, 14];
const TEXT = [0, 3, 8, 8, 8];

function ranges(text: string, words: string[]): Range[] {
  const folded = fold(text);
  const found: Range[] = [];
  for (const word of words) {
    let at = folded.indexOf(word);
    while (at !== -1) {
      found.push([at, at + word.length]);
      at = folded.indexOf(word, at + word.length);
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  const merged: Range[] = [];
  for (const range of found) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/** A window of `text` around its first match, cut at word edges. */
function excerpt(text: string, words: string[], width = 110): string {
  const folded = fold(text);
  const at = Math.min(...words.map((word) => folded.indexOf(word)).filter((index) => index >= 0));
  if (!Number.isFinite(at) || text.length <= width) return text.slice(0, width);
  const start = Math.max(0, at - Math.floor(width / 3));
  let line = text.slice(start, start + width);
  if (start > 0) line = `…${line.replace(/^\S*\s/, "")}`;
  if (start + width < text.length) line = `${line.replace(/\s\S*$/, "")}…`;
  return line;
}

/** The segment that holds the query, else the first one: a snippet never spans two segments. */
function snippet(segments: readonly string[], words: string[]): string {
  const found = segments.find((segment) => words.some((word) => fold(segment).includes(word)));
  return excerpt(found ?? segments[0] ?? "", words);
}

/** The best quality of `word` over the segments. */
function inSegments(segments: readonly string[], word: string): number {
  let best = 0;
  for (const segment of segments) best = Math.max(best, quality(segment, fold(segment), word));
  return best;
}

/**
 * An entry's score: its own title outweighs its text; a page's description counts for the page.
 * A heading's page title only lets a word match (a page name plus a heading name) and orders
 * equal scores; it never lifts a heading above a better one of another page.
 */
function score(entry: SearchEntry, words: string[]): { value: number; tie: number } {
  let value = 0;
  let tie = 0;
  const title = fold(entry.t);
  const page = fold(entry.p);
  const description = fold(entry.d);
  for (const word of words) {
    const inTitle = TITLE[quality(entry.t, title, word)]!;
    const inText = TEXT[inSegments(entry.x, word)]!;
    const inDescription = entry.k === "page" ? PAGE[quality(entry.d, description, word)]! : 0;
    const inPage = entry.k === "heading" && quality(entry.p, page, word) > 0;
    const best = Math.max(inTitle, inText, inDescription);
    if (!best && !inPage) return { value: 0, tie: 0 };
    value += best + (inTitle && inText ? 2 : 0);
    if (inPage) tie += 1;
  }
  return { value: value + (entry.k === "page" ? 5 : 0), tie };
}

/** Hits below the best one's score divided by this are left out. */
const FLOOR = 4;

/** Hits a single page may take, so one long page does not fill the list. */
const PER_PAGE = 3;

/** The best hits for `query` in score order; neighbouring hits of one section form a group. */
export function search(index: readonly SearchEntry[], query: string, limit = 12): SearchGroup[] {
  const words = queryWords(query);
  if (!words.length) return [];
  const scored: (SearchHit & { tie: number })[] = [];
  for (const entry of index) {
    const { value, tie } = score(entry, words);
    if (!value) continue;
    const detail =
      entry.k === "page" ? entry.d : [entry.p, snippet(entry.x, words)].filter(Boolean).join(" · ");
    scored.push({
      entry,
      score: value,
      tie,
      titleRanges: ranges(entry.t, words),
      detail,
      detailRanges: ranges(detail, words),
    });
  }
  scored.sort((a, b) => b.score - a.score || b.tie - a.tie || a.entry.t.length - b.entry.t.length);
  const perPage = new Map<string, number>();
  const hits: SearchHit[] = [];
  for (const { tie: _tie, ...hit } of scored) {
    if (hits.length === limit) break;
    const page = hit.entry.u.split("#")[0]!;
    const taken = perPage.get(page) ?? 0;
    if (taken === PER_PAGE) continue;
    perPage.set(page, taken + 1);
    hits.push(hit);
  }
  // a hit far below the best one is noise; the rest keep the score order, and only neighbours
  // of one section share a group, so a strong hit never waits behind a weaker one of its section
  const floor = (hits[0]?.score ?? 0) / FLOOR;
  const groups: SearchGroup[] = [];
  for (const hit of hits) {
    if (hit.score < floor) break;
    const last = groups[groups.length - 1];
    if (last?.section === hit.entry.s) last.hits.push(hit);
    else groups.push({ section: hit.entry.s, hits: [hit] });
  }
  return groups;
}
