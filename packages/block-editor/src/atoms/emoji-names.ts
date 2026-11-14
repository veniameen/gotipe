type Names = Readonly<Record<string, string>>;

let ru: Names | null = null;
let loading: Promise<Names> | null = null;

const russian = (locale: string | undefined) => !!locale?.toLowerCase().startsWith("ru");

/**
 * Localized emoji names, loaded on first need: Russian (`@gotipe/core/emoji/ru`) for a `ru`
 * interface; other languages use the shortcodes and load nothing.
 */
export function loadEmojiNames(locale: string | undefined): Promise<Names | undefined> {
  if (!russian(locale)) return Promise.resolve(undefined);
  loading ??= import("@gotipe/core/emoji/ru").then((module) => {
    ru = module.EMOJI_NAMES_RU;
    return ru;
  });
  return loading;
}

/** The names already loaded for `locale`, or undefined. */
export const emojiNames = (locale: string | undefined): Names | undefined =>
  russian(locale) ? (ru ?? undefined) : undefined;
