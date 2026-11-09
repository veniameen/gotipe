import { type I18n, createI18n, en, ru } from "@gotipe/i18n";
import type React from "react";
import { createContext, useContext, useMemo } from "react";

const I18nContext = createContext<I18n | null>(null);
let defaultI18n: I18n | null = null;

/**
 * Provides UI strings to GoTipe components. Pass an `I18n` from
 * `@gotipe/i18n` or just a locale name (`"ru"`, `"en"`).
 */
export function GoTipeI18nProvider({
  i18n,
  locale,
  children,
}: {
  i18n?: I18n;
  locale?: string;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => i18n ?? createI18n({ locale: locale ?? "en", locales: { en, ru } }),
    [i18n, locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The current `I18n` (English when no provider is mounted). */
export function useGoTipeI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  if (!defaultI18n) defaultI18n = createI18n({ locale: "en", locales: { en, ru } });
  return defaultI18n;
}
