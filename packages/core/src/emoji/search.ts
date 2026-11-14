import type { SuggestionSource } from "../extensions/suggestion/types";
import { EMOJI_CATEGORIES, EMOJI_TABLE } from "./shortcodes";
import type { EmojiCategory } from "./types";

/** A Unicode emoji found by its shortcode, localized name or character. */
export interface EmojiItem {
  /** The primary shortcode, without colons. */
  name: string;
  emoji: string;
  /** The picker tab the emoji belongs to. */
  category: EmojiCategory;
}

const WORD_BREAK = /[^\p{L}\p{N}]+/u;
const VARIATION_SELECTOR = /️/g;

/** Case-insensitive form in which Cyrillic `ё` and `е` are the same letter. */
function fold(value: string): string {
  return value.toLowerCase().replaceAll("ё", "е");
}

function* rows(): Generator<[EmojiItem, readonly string[]]> {
  for (const category of EMOJI_CATEGORIES) {
    for (const [name, emoji, ...aliases] of EMOJI_TABLE[category]) {
      yield [{ name, emoji, category }, [name, ...aliases]];
    }
  }
}

function matchName(needle: string, name: string | undefined): "prefix" | "inside" | undefined {
  if (name === undefined) return undefined;
  const folded = fold(name);
  if (folded.startsWith(needle)) return "prefix";
  if (folded.split(WORD_BREAK).some((word) => word.startsWith(needle))) return "prefix";
  return folded.includes(needle) ? "inside" : undefined;
}

/**
 * Emoji whose shortcode or alias matches `query` (case-insensitive): prefix matches first,
 * then other substring matches, each in table order. An empty query lists the table.
 * With `names` (shortcode → localized name, e.g. `EMOJI_NAMES_RU` from
 * `@gotipe/core/emoji/ru`) the localized name matches too: its start or the start of any of
 * its words counts as a prefix match, any other substring as an inside match; `ё` equals `е`.
 */
export function searchEmoji(
  query: string,
  limit = 10,
  names?: Readonly<Record<string, string>>,
): EmojiItem[] {
  const needle = fold(query);
  const prefix: EmojiItem[] = [];
  const inside: EmojiItem[] = [];
  for (const [item, shortcodes] of rows()) {
    const local = matchName(needle, names?.[item.name]);
    if (local === "prefix" || shortcodes.some((value) => value.startsWith(needle))) {
      prefix.push(item);
    } else if (local === "inside" || shortcodes.some((value) => value.includes(needle))) {
      inside.push(item);
    }
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...inside].slice(0, Math.max(0, limit));
}

/** The grid of one picker tab, in table order. */
export function emojiItems(category: EmojiCategory): EmojiItem[] {
  return EMOJI_TABLE[category].map(([name, emoji]) => ({ name, emoji, category }));
}

/**
 * The table entry of an emoji character, for example to rebuild a "recent" row from stored
 * characters. A missing or extra U+FE0F variation selector still matches.
 */
export function findEmoji(emoji: string): EmojiItem | undefined {
  const target = emoji.replace(VARIATION_SELECTOR, "");
  for (const [item] of rows()) {
    if (item.emoji.replace(VARIATION_SELECTOR, "") === target) return item;
  }
  return undefined;
}

/**
 * Items for `defineSuggestion({ char: ":", source: emojiSource, onSelect })`, matched by
 * shortcode only; for localized names pass `{ search: (query) => searchEmoji(query, 10,
 * names) }` instead. The host's `onSelect` replaces `range` with `item.emoji` as plain text,
 * for example by dispatching `deleteText` over the range and `insertText` of the emoji at
 * `range.from`.
 */
export const emojiSource: SuggestionSource<EmojiItem> = {
  search: (query) => searchEmoji(query),
};
