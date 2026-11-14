/**
 * Characters are what a reader sees as one: grapheme clusters, so 👍🏽, 🇷🇺 and й written with a
 * combining breve count once and a surrogate pair is never split. Words are counted by
 * `Intl.Segmenter` when the platform has it, otherwise as runs of letters and digits.
 */
type Segmenter = { segment(text: string): Iterable<{ index: number; isWordLike?: boolean }> };

let graphemeSegmenter: Segmenter | null | undefined;
const wordSegmenters = new Map<string, Segmenter | null>();

function segmenter(granularity: "grapheme" | "word", locale?: string): Segmenter | null {
  const Constructor = (
    globalThis as {
      Intl?: { Segmenter?: new (locale?: string, options?: object) => Segmenter };
    }
  ).Intl?.Segmenter;
  if (typeof Constructor !== "function") return null;
  try {
    return new Constructor(locale, { granularity });
  } catch {
    return new Constructor(undefined, { granularity });
  }
}

function graphemes(): Segmenter | null {
  if (graphemeSegmenter === undefined) graphemeSegmenter = segmenter("grapheme");
  return graphemeSegmenter;
}

const MARK = /^\p{M}$/u;
const within = (point: number, from: number, to: number) => point >= from && point <= to;
/** Joins the previous cluster: a mark, a joiner, a variation selector, a skin tone or a tag. */
const extending = (point: number, char: string) =>
  point === 0x200d ||
  within(point, 0xfe00, 0xfe0f) ||
  within(point, 0x1f3fb, 0x1f3ff) ||
  within(point, 0xe0020, 0xe007f) ||
  within(point, 0xe0100, 0xe01ef) ||
  MARK.test(char);

/** Platforms without `Intl.Segmenter`: marks, joiners, modifiers, flags and CR LF join. */
function fallbackClusters(text: string, max: number): { count: number; end: number } {
  let count = 0;
  let joined = false;
  let flagHalf = false;
  for (let index = 0; index < text.length; ) {
    const point = text.codePointAt(index)!;
    const char = String.fromCodePoint(point);
    const regional = within(point, 0x1f1e6, 0x1f1ff);
    const extend =
      index > 0 &&
      (joined ||
        extending(point, char) ||
        (char === "\n" && text[index - 1] === "\r") ||
        (regional && flagHalf));
    if (!extend) {
      if (count === max) return { count, end: index };
      count++;
      flagHalf = regional;
    } else if (regional) flagHalf = false;
    joined = point === 0x200d;
    index += char.length;
  }
  return { count, end: text.length };
}

export function countCharacters(text: string): number {
  if (!text) return 0;
  const segments = graphemes();
  if (!segments) return fallbackClusters(text, Number.POSITIVE_INFINITY).count;
  let count = 0;
  for (const _ of segments.segment(text)) count++;
  return count;
}

/** The longest start of `text` with at most `max` characters, cut between clusters. */
export function fitCharacters(text: string, max: number): string {
  if (max <= 0) return "";
  const segments = graphemes();
  if (!segments) return text.slice(0, fallbackClusters(text, max).end);
  let count = 0;
  for (const segment of segments.segment(text)) {
    if (count === max) return text.slice(0, segment.index);
    count++;
  }
  return text;
}

const WORD_FALLBACK = /[\p{L}\p{N}\p{M}]+(?:['’.\-][\p{L}\p{N}\p{M}]+)*/gu;

export function countWords(text: string, locale?: string): number {
  if (!text) return 0;
  const key = locale ?? "";
  if (!wordSegmenters.has(key)) wordSegmenters.set(key, segmenter("word", locale));
  const segments = wordSegmenters.get(key);
  if (!segments) return text.match(WORD_FALLBACK)?.length ?? 0;
  let count = 0;
  for (const segment of segments.segment(text)) if (segment.isWordLike) count++;
  return count;
}

/** Counts of plain text: characters as grapheme clusters, words by the locale's rules. */
export function countText(text: string, locale?: string): { characters: number; words: number } {
  return { characters: countCharacters(text), words: countWords(text, locale) };
}
