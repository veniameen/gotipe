// Optional entry `@gotipe/core/emoji`: the shortcode table of Unicode emoji stays out of
// the core bundle and loads only when a host imports it.
export { EMOJI_SHORTCODES } from "./emoji/shortcodes";
export { emojiSource, searchEmoji } from "./emoji/search";
export type { EmojiItem } from "./emoji/search";
