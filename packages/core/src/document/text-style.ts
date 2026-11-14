/**
 * Values of the `fontFamily` and `fontSize` marks and of the block attribute `dir`, shared by
 * the commands, the HTML serializer and the HTML import. The Rust port is
 * crates/gotipe-export/src/html/text_style.rs; both write the same bytes.
 */

/** Named families: renderers map them to theme tokens, never to arbitrary CSS. */
export type FontFamilyName = "system" | "serif" | "mono";
export const FONT_FAMILIES: readonly FontFamilyName[] = ["system", "serif", "mono"];

/** The generic CSS family written into HTML for each name. */
const FAMILY_CSS: Record<FontFamilyName, string> = {
  system: "system-ui",
  serif: "serif",
  mono: "monospace",
};

/**
 * Hard bounds of `fontSize` (px). Serializers and renderers honour only an integer size
 * within them; other values stay in the document but are not written or applied.
 */
export const FONT_SIZE_LIMITS = { min: 6, max: 96 } as const;

export type TextDirection = "ltr" | "rtl" | "auto";
export const TEXT_DIRECTIONS: readonly TextDirection[] = ["ltr", "rtl", "auto"];

export function isFontFamily(value: unknown): value is FontFamilyName {
  return FONT_FAMILIES.includes(value as FontFamilyName);
}

/** An integer size within `FONT_SIZE_LIMITS`: the only sizes that are written or applied. */
export function isFontSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= FONT_SIZE_LIMITS.min &&
    value <= FONT_SIZE_LIMITS.max
  );
}

export function isTextDirection(value: unknown): value is TextDirection {
  return TEXT_DIRECTIONS.includes(value as TextDirection);
}

/** CSS `font-family` of a valid family name, or null. */
export function fontFamilyCss(family: unknown): string | null {
  return isFontFamily(family) ? FAMILY_CSS[family] : null;
}

/**
 * The family of an imported CSS `font-family`. Only a single generic name is read: the
 * ones GoTipe writes (`system-ui`, `serif`, `monospace`), their `ui-*` variants and
 * `sans-serif` (the system face). A list of named faces (`Arial, sans-serif`, as office
 * suites write on every run) is the source's styling, not a choice of family, and is dropped.
 */
export function fontFamilyFromCss(value: string): FontFamilyName | null {
  const name = value
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .toLowerCase();
  if (["system-ui", "ui-sans-serif", "sans-serif", "-apple-system"].includes(name)) return "system";
  if (name === "serif" || name === "ui-serif") return "serif";
  if (name === "monospace" || name === "ui-monospace") return "mono";
  return null;
}

/** The size of an imported CSS `font-size`: whole pixels within the bounds, else null. */
export function fontSizeFromCss(value: string): number | null {
  const match = /^\s*(\d+)px\s*$/i.exec(value);
  const size = match ? Number(match[1]) : Number.NaN;
  return isFontSize(size) ? size : null;
}
