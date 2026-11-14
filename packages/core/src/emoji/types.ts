/** A tab of the emoji picker; the table keeps its emoji in this grouping. */
export type EmojiCategory =
  | "people"
  | "nature"
  | "food"
  | "activities"
  | "travel"
  | "objects"
  | "symbols"
  | "flags";

/** `[name, emoji, ...aliases]`: the primary shortcode, the Unicode emoji and other shortcodes. */
export type EmojiRow = readonly [string, string, ...string[]];
