import { adjacentGraphemeOffset } from "../text";

/** UTF-16 deletion boundaries; Intl.Segmenter supplies locale-aware word segmentation. */
export function deletionBoundary(
  text: string,
  offset: number,
  direction: -1 | 1,
  inputType: string,
): number {
  if (inputType.includes("Line")) {
    if (direction < 0) return text.lastIndexOf("\n", offset - 1) + 1;
    const newline = text.indexOf("\n", offset);
    return newline < 0 ? text.length : newline;
  }
  if (!inputType.includes("Word")) return adjacentGraphemeOffset(text, offset, direction);
  if (typeof Intl.Segmenter === "function") {
    const segments = Array.from(
      new Intl.Segmenter(undefined, { granularity: "word" }).segment(text),
    );
    if (direction < 0) {
      const before = segments.filter((segment) => segment.index < offset);
      while (before.length > 1 && /^\s+$/u.test(before.at(-1)!.segment)) before.pop();
      return before.at(-1)?.index ?? 0;
    }
    const after = segments.filter((segment) => segment.index + segment.segment.length > offset);
    while (after.length > 1 && /^\s+$/u.test(after[0]!.segment)) after.shift();
    const next = after[0];
    return next ? next.index + next.segment.length : text.length;
  }
  let current = offset;
  const char = () =>
    direction < 0
      ? text.slice(adjacentGraphemeOffset(text, current, -1), current)
      : text.slice(current, adjacentGraphemeOffset(text, current, 1));
  while ((direction < 0 ? current > 0 : current < text.length) && /\s/u.test(char()))
    current = adjacentGraphemeOffset(text, current, direction);
  while ((direction < 0 ? current > 0 : current < text.length) && !/\s/u.test(char()))
    current = adjacentGraphemeOffset(text, current, direction);
  return current;
}
