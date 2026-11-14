import {
  type BlockEditorTranslationKey,
  type I18n,
  type TranslationKey,
  pluralCategory,
} from "@gotipe/i18n";
import { useGoTipeI18n } from "@gotipe/react";
import { blockEditorEn } from "./en";
import { blockEditorRu } from "./ru";

/** The block editor's own strings in one language. */
export type BlockEditorLocale = Record<BlockEditorTranslationKey, string>;

const TABLES: Record<string, BlockEditorLocale | undefined> = {
  en: blockEditorEn,
  ru: blockEditorRu,
};
const layered = new WeakMap<I18n, I18n>();
const own = new WeakSet<I18n>();

function format(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  let out = text;
  for (const [name, value] of Object.entries(params))
    out = out.split(`{${name}}`).join(String(value));
  return out;
}

/**
 * The host's `I18n` with the block editor's strings under it: a string of the host's
 * dictionaries wins (a missing key comes back as the key itself, as from `createI18n`);
 * otherwise the block editor's table of the current language, then its English one.
 */
export function withBlockEditorStrings(i18n: I18n): I18n {
  if (own.has(i18n)) return i18n;
  const cached = layered.get(i18n);
  if (cached) return cached;
  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const value = i18n.t(key, params);
    if (value !== key) return value;
    const name = key as BlockEditorTranslationKey;
    const text = TABLES[i18n.locale]?.[name] ?? blockEditorEn[name];
    return text === undefined ? value : format(text, params);
  };
  const result: I18n = {
    get locale() {
      return i18n.locale;
    },
    setLocale: (locale) => i18n.setLocale(locale),
    addLocale: (name, translations) => i18n.addLocale(name, translations),
    t,
    plural: (base, count, params) =>
      t(`${base}.${pluralCategory(i18n.locale, count)}` as TranslationKey, { count, ...params }),
  };
  own.add(result);
  layered.set(i18n, result);
  return result;
}

/** The current `I18n` with the block editor's strings (see `withBlockEditorStrings`). */
export function useBlockEditorI18n(): I18n {
  return withBlockEditorStrings(useGoTipeI18n());
}
