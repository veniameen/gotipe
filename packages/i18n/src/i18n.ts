import type { I18n, Locale, TranslationKey } from "./types";

const locales = new Map<string, Locale>();

export function defineLocale(name: string, translations: Locale): Locale {
  locales.set(name, translations);
  return translations;
}

export function createI18n(options: { defaultLocale?: string } = {}): I18n {
  let currentLocale = options.defaultLocale ?? "en";
  return {
    get locale() {
      return currentLocale;
    },
    setLocale(locale: string): void {
      if (!locales.has(locale)) {
        console.warn(`GoTipe i18n: locale "${locale}" not found`);
        return;
      }
      currentLocale = locale;
    },
    addLocale(name: string, translations: Locale): void {
      defineLocale(name, translations);
    },
    t(key: TranslationKey, params?: Record<string, string | number>): string {
      const translations = locales.get(currentLocale);
      if (!translations) return key;
      let text = translations[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
  };
}
