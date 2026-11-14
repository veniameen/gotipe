import type { SuggestionSource } from "../extensions/suggestion/types";
import { EMOJI_SHORTCODES } from "./shortcodes";

/** A Unicode emoji found by its shortcode. */
export interface EmojiItem {
  /** The primary shortcode, without colons. */
  name: string;
  emoji: string;
}

/**
 * Emoji whose shortcode or alias matches `query` (case-insensitive): prefix matches first,
 * then other substring matches, each in table order. An empty query lists the table.
 */
export function searchEmoji(query: string, limit = 10): EmojiItem[] {
  const needle = query.toLowerCase();
  const prefix: EmojiItem[] = [];
  const inside: EmojiItem[] = [];
  for (const [name, emoji, ...aliases] of EMOJI_SHORTCODES) {
    const names = [name, ...aliases];
    if (names.some((value) => value.startsWith(needle))) prefix.push({ name, emoji });
    else if (names.some((value) => value.includes(needle))) inside.push({ name, emoji });
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...inside].slice(0, Math.max(0, limit));
}

/**
 * Items for `defineSuggestion({ char: ":", source: emojiSource, onSelect })`. The host's
 * `onSelect` replaces `range` with `item.emoji` as plain text, for example by dispatching
 * `deleteText` over the range and `insertText` of the emoji at `range.from`.
 */
export const emojiSource: SuggestionSource<EmojiItem> = {
  search: (query) => searchEmoji(query),
};
