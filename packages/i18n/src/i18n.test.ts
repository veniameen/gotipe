import { describe, expect, it } from "vitest";
import { createI18n, en, pluralCategory, ru } from "./index";

describe("i18n", () => {
  it("translates with explicit locales and falls back to English", () => {
    const i18n = createI18n({ locale: "ru", locales: { ru, en } });
    expect(i18n.t("code.copy")).toBe(ru["code.copy"]);
    expect(i18n.t("review.editing", { name: "GigaChat 2" })).toBe("Правит GigaChat 2");
    const partial = createI18n({
      locale: "xx",
      locales: { xx: { ...ru, "code.copy": undefined as never }, en },
    });
    expect(partial.t("code.copy")).toBe(en["code.copy"]);
  });

  it("uses Russian plural forms", () => {
    // Plural keys belong to the block editor; a host dictionary may carry them too.
    const proposals = {
      "review.proposals.one": "{count} предложение",
      "review.proposals.few": "{count} предложения",
      "review.proposals.many": "{count} предложений",
    };
    const i18n = createI18n({ locale: "ru", locales: { ru: { ...ru, ...proposals }, en } });
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
    expect(pluralCategory("en", 3)).toBe("many");
  });

  it("returns the key itself when no dictionary has it", () => {
    // `@gotipe/block-editor` relies on this to put its own strings under the host's.
    const i18n = createI18n({ locale: "ru", locales: { ru, en } });
    expect(i18n.t("find.label")).toBe("find.label");
    expect(i18n.t("history.restored", { name: "x" })).toBe("history.restored");
  });

  it("has every key in both locales", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });
});
