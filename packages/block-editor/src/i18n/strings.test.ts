import { createI18n, en, ru } from "@gotipe/i18n";
import { describe, expect, it } from "vitest";
import { blockEditorEn } from "./en";
import { blockEditorRu } from "./ru";
import { withBlockEditorStrings } from "./strings";

describe("block editor strings", () => {
  it("has every key in both languages and none of @gotipe/i18n's", () => {
    expect(Object.keys(blockEditorRu).sort()).toEqual(Object.keys(blockEditorEn).sort());
    expect(Object.keys(blockEditorEn).filter((key) => key in en)).toEqual([]);
  });

  it("puts its own strings under the host's dictionary", () => {
    const i18n = withBlockEditorStrings(createI18n({ locale: "ru", locales: { en, ru } }));
    expect(i18n.t("find.label")).toBe(blockEditorRu["find.label"]);
    expect(i18n.t("code.copy")).toBe(ru["code.copy"]);
    expect(i18n.t("history.restored", { name: "v2" })).toBe(
      blockEditorRu["history.restored"].replace("{name}", "v2"),
    );
    expect(i18n.plural("history.changed", 5)).toBe(
      blockEditorRu["history.changed.many"].replace("{count}", "5"),
    );
    expect(i18n.locale).toBe("ru");
  });

  it("lets the host override a block editor string", () => {
    const host = createI18n({ locale: "en", locales: { en: { ...en, "find.label": "Search" } } });
    const i18n = withBlockEditorStrings(host);
    expect(i18n.t("find.label")).toBe("Search");
    expect(i18n.t("find.next")).toBe(blockEditorEn["find.next"]);
  });

  it("falls back to English for a language it does not ship", () => {
    const i18n = withBlockEditorStrings(createI18n({ locale: "de", locales: { en, de: en } }));
    expect(i18n.t("align.label")).toBe(blockEditorEn["align.label"]);
  });

  it("keeps a Russian review particle with the word after it", () => {
    for (const [key, value] of Object.entries(blockEditorRu)) {
      if (key.startsWith("review.")) expect(value, key).not.toMatch(/(?:^|\s)(?:не|в|к|с|о|и) /i);
    }
    expect(blockEditorRu["review.staleText"]).toContain("не\u00a0применить");
  });

  it("layers an I18n once", () => {
    const host = createI18n({ locale: "en", locales: { en } });
    const layered = withBlockEditorStrings(host);
    expect(withBlockEditorStrings(host)).toBe(layered);
    expect(withBlockEditorStrings(layered)).toBe(layered);
  });
});
