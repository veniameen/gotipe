import type { I18n, Locale, PluralKeyBase, TranslationKey } from "./types";

const locales = new Map<string, Locale>();

/** Registers a locale globally (kept for compatibility; prefer `createI18n({ locales })`). */
export function defineLocale(name: string, translations: Locale): Locale {
  locales.set(name, translations);
  return translations;
}

function format(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  let out = text;
  for (const [k, v] of Object.entries(params)) {
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/** CLDR plural category used by the GoTipe keys: one | few | many. */
export function pluralCategory(locale: string, count: number): "one" | "few" | "many" {
  const n = Math.abs(Math.trunc(count));
  if (locale.startsWith("ru") || locale.startsWith("uk") || locale.startsWith("be")) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "one";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
    return "many";
  }
  return n === 1 ? "one" : "many";
}

export interface CreateI18nOptions {
  /** Current locale. */
  locale?: string;
  /** @deprecated use `locale`. */
  defaultLocale?: string;
  /** Locales by name; merged with globally defined ones. */
  locales?: Record<string, Locale>;
  /** Locale used for keys missing in the current one. */
  fallbackLocale?: string;
}

export function createI18n(options: CreateI18nOptions = {}): I18n {
  const own = new Map<string, Locale>(Object.entries(options.locales ?? {}));
  const lookup = (name: string): Locale | undefined => own.get(name) ?? locales.get(name);
  let currentLocale = options.locale ?? options.defaultLocale ?? "en";
  const fallback = options.fallbackLocale ?? "en";

  const translate = (key: TranslationKey): string => {
    const value = lookup(currentLocale)?.[key];
    if (value !== undefined) return value;
    return lookup(fallback)?.[key] ?? key;
  };

  return {
    get locale() {
      return currentLocale;
    },
    setLocale(locale: string): void {
      if (!lookup(locale)) {
        console.warn(`GoTipe i18n: locale "${locale}" not found`);
        return;
      }
      currentLocale = locale;
    },
    addLocale(name: string, translations: Locale): void {
      own.set(name, translations);
    },
    t(key: TranslationKey, params?: Record<string, string | number>): string {
      return format(translate(key), params);
    },
    plural(base: PluralKeyBase, count: number, params?: Record<string, string | number>): string {
      const category = pluralCategory(currentLocale, count);
      return format(translate(`${base}.${category}` as TranslationKey), { count, ...(params ?? {}) });
    },
  };
}
