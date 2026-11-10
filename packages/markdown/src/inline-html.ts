import type { Mark } from "./types";

const TAGS: Record<string, string> = {
  u: "underline",
  mark: "highlight",
  sup: "superscript",
  sub: "subscript",
  em: "italic",
  i: "italic",
  strong: "bold",
  b: "bold",
  s: "strikethrough",
  del: "strikethrough",
};
/** Inert CSS colors only: excludes declarations, URLs and escaped tokens. */
export function cssColor(value: unknown): string | null {
  return typeof value === "string" &&
    /^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d.% ,/+\-]+\))$/i.test(value)
    ? value
    : null;
}
export function inlineHtmlMark(value: string): { tag: string; mark: Mark } | null {
  const plain = /^<(u|mark|sup|sub|em|strong|b|i|s|del)>$/i.exec(value);
  if (plain) {
    const tag = plain[1]!.toLowerCase();
    return { tag, mark: { type: TAGS[tag]! } };
  }
  const styled =
    /^<(span|mark)\s+style=["']\s*(color|background(?:-color)?)\s*:\s*([^"';]+);?\s*["']\s*>$/i.exec(
      value,
    );
  if (!styled) return null;
  const tag = styled[1]!.toLowerCase();
  const property = styled[2]!.toLowerCase();
  const color = cssColor(styled[3]!.trim());
  if (!color || (tag === "span" ? property !== "color" : property === "color")) return null;
  return { tag, mark: { type: tag === "span" ? "textColor" : "highlight", attrs: { color } } };
}
