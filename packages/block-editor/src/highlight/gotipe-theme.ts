/**
 * A Shiki theme drawn with the GoTipe syntax tokens (GoTipe Atlas, frame 1): keywords blue,
 * strings green, numbers teal, types amber, comments quiet and upright. The colours are
 * `var(--gt-syn-*)`, so one theme serves light and dark; pass it as both:
 * `themes: { light: gotipeCodeThemeLoader, dark: gotipeCodeThemeLoader }`.
 */
export const gotipeCodeTheme = {
  name: "gotipe",
  type: "light",
  colors: {
    "editor.foreground": "var(--gt-text)",
    "editor.background": "var(--gt-sunken)",
  },
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "var(--gt-syn-comment)" },
    },
    {
      scope: ["string", "string.template", "punctuation.definition.string", "string.regexp"],
      settings: { foreground: "var(--gt-syn-string)" },
    },
    {
      scope: ["constant.numeric", "constant.language", "constant.character", "constant.other"],
      settings: { foreground: "var(--gt-syn-number)" },
    },
    {
      scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control"],
      settings: { foreground: "var(--gt-syn-keyword)" },
    },
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "entity.other.inherited-class",
        "support.type",
        "support.class",
      ],
      settings: { foreground: "var(--gt-syn-type)" },
    },
    {
      scope: ["punctuation", "meta.brace", "keyword.operator"],
      settings: { foreground: "var(--gt-syn-punct)" },
    },
  ],
};

/** The loader form `createShikiHighlighter` expects for a theme. */
export const gotipeCodeThemeLoader = () => Promise.resolve({ default: gotipeCodeTheme });
