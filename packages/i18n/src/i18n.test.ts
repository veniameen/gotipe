import { describe, expect, it } from "vitest";
import { createI18n, en, pluralCategory, ru } from "./index";

describe("i18n", () => {
  it("translates with explicit locales and falls back to English", () => {
    const i18n = createI18n({ locale: "ru", locales: { ru, en } });
    expect(i18n.t("review.acceptAll")).toBe("Принять все");
    expect(i18n.t("review.editing", { name: "GigaChat 2" })).toBe("Правит GigaChat 2");
    const partial = createI18n({
      locale: "xx",
      locales: { xx: { ...ru, "review.accept": undefined as never }, en },
    });
    expect(partial.t("review.accept")).toBe("Accept");
  });

  it("uses Russian plural forms", () => {
    const i18n = createI18n({ locale: "ru", locales: { ru, en } });
    expect([1, 2, 5, 11, 21, 22, 25].map((n) => i18n.plural("review.proposals", n))).toEqual([
      "1 предложение",
      "2 предложения",
      "5 предложений",
      "11 предложений",
      "21 предложение",
      "22 предложения",
      "25 предложений",
    ]);
    expect(pluralCategory("en", 1)).toBe("one");
    expect(createI18n({ locale: "en", locales: { en } }).plural("review.proposals", 3)).toBe(
      "3 suggestions",
    );
  });

  it("has every key in both locales", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });
});
