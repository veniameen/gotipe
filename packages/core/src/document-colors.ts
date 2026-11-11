import { toSafeColor } from "./security/colors";

/**
 * The palette an editor writes into documents (GoTipe Atlas, frame 6). A mark stores the light
 * print colour, so exports and other renderers show it as it is; an editor renders a value of the
 * palette through its theme token, so the colour follows light and dark.
 */
export interface DocumentColor {
  /** Stable name; labels are built from it. */
  name: string;
  /** The stored value: the colour on a light page. */
  value: string;
  /** The theme token an editor renders instead. */
  token: string;
}

export const DOCUMENT_TEXT_COLORS: readonly DocumentColor[] = [
  { name: "Gray", value: "#66665f", token: "--gt-tc-gray" },
  { name: "Red", value: "#c4382f", token: "--gt-tc-red" },
  { name: "Amber", value: "#9a6500", token: "--gt-tc-amber" },
  { name: "Green", value: "#2b7547", token: "--gt-tc-green" },
  { name: "Blue", value: "#2c62d4", token: "--gt-tc-blue" },
];

export const DOCUMENT_HIGHLIGHT_COLORS: readonly DocumentColor[] = [
  { name: "Yellow", value: "#fbf0ce", token: "--gt-bg-yellow" },
  { name: "Green", value: "#e1ece5", token: "--gt-bg-green" },
  { name: "Blue", value: "#e6ecfa", token: "--gt-bg-blue" },
  { name: "Red", value: "#f8e7e6", token: "--gt-bg-red" },
  { name: "Gray", value: "#ededed", token: "--gt-bg-gray" },
];

/** Values of the earlier palette that have an equivalent in this one. */
const EARLIER_VALUES: Record<string, string> = {
  "#6b7280": "--gt-tc-gray",
  "#92400e": "--gt-tc-amber",
  "#c2410c": "--gt-tc-amber",
  "#1d4ed8": "--gt-tc-blue",
  "#dc2626": "--gt-tc-red",
  "#dbeafe": "--gt-bg-blue",
  "#dcfce7": "--gt-bg-green",
  "#fef9c3": "--gt-bg-yellow",
  "#fecaca": "--gt-bg-red",
};

const TOKENS = new Map<string, string>([
  ...DOCUMENT_TEXT_COLORS.map((color) => [color.value, color.token] as const),
  ...DOCUMENT_HIGHLIGHT_COLORS.map((color) => [color.value, color.token] as const),
  ...Object.entries(EARLIER_VALUES),
]);

/**
 * The CSS value an editor renders for a stored colour: a palette value becomes its theme token
 * (with the stored value as the fallback), any other safe colour stays as it is, unsafe input is
 * dropped.
 */
export function documentColorStyle(value: unknown): string | null {
  const safe = toSafeColor(value);
  if (!safe) return null;
  const token = TOKENS.get(safe.toLowerCase());
  return token ? `var(${token}, ${safe})` : safe;
}
