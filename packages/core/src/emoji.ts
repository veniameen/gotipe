// Optional entry `@gotipe/core/emoji`: the shortcode table of Unicode emoji stays out of
// the core bundle and loads only when a host imports it.
export { EMOJI_CATEGORIES, EMOJI_SHORTCODES, EMOJI_TABLE } from "./emoji/shortcodes";
export { emojiItems, emojiSource, findEmoji, searchEmoji } from "./emoji/search";
export type { EmojiItem } from "./emoji/search";
export type { EmojiCategory } from "./emoji/types";
