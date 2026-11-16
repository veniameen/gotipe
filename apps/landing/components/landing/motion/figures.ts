/**
 * The landing's figures as they count up when they come into view: «652 / 652», «~127 KB»,
 * «949». Pure functions, no DOM; the server HTML always holds the final figure.
 */

/** A figure split into the numbers that count and the text that stays between them. */
export type FigurePart = string | number;

/** «652 / 652» → [652, " / ", 652]; «~127 KB» → ["~", 127, " KB"]; text without digits stays. */
export function figureParts(text: string): FigurePart[] {
  const parts: FigurePart[] = [];
  let last = 0;
  for (const match of text.matchAll(/\d+/g)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(Number(match[0]));
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Fast at first, slow at the end: the count settles on its figure. */
export const easeOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** The figure at `t` of its count (0 to 1): every number grows from 0 to its value, eased. */
export function figureAt(parts: FigurePart[], t: number): string {
  const share = easeOut(t);
  return parts
    .map((part) => (typeof part === "number" ? String(Math.round(part * share)) : part))
    .join("");
}
