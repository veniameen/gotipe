import { ACTIVITIES, TRAVEL } from "./activities-travel";
import { FOOD, NATURE } from "./nature-food";
import { OBJECTS } from "./objects";
import { PEOPLE } from "./people";
import { FLAGS, SYMBOLS } from "./symbols-flags";
import type { EmojiCategory, EmojiRow } from "./types";

/** The picker tabs, in display order. */
export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  "people",
  "nature",
  "food",
  "activities",
  "travel",
  "objects",
  "symbols",
  "flags",
];

/**
 * Common emoji shortcodes (gemoji and Slack names) by category: `[name, emoji, ...aliases]`.
 * Unicode emoji are inserted as plain text, not atoms. This table lives in the optional
 * `@gotipe/core/emoji` entry, outside the core bundle.
 */
export const EMOJI_TABLE: Readonly<Record<EmojiCategory, readonly EmojiRow[]>> = {
  people: PEOPLE,
  nature: NATURE,
  food: FOOD,
  activities: ACTIVITIES,
  travel: TRAVEL,
  objects: OBJECTS,
  symbols: SYMBOLS,
  flags: FLAGS,
};

/** Every row of {@link EMOJI_TABLE} as one list, in category order. */
export const EMOJI_SHORTCODES: readonly EmojiRow[] = EMOJI_CATEGORIES.flatMap(
  (category) => EMOJI_TABLE[category],
);
