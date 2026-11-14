/**
 * The `[from, to)` pairs of every non-empty match of `pattern` (with the `g` flag) in `text`, in
 * UTF-16 offsets, or `null` when the clock passed `deadline` first. A match never starts or ends
 * inside a surrogate pair; with `wholeWord` a match touching a letter, a digit, a combining mark
 * or `_` is skipped.
 *
 * The function uses nothing outside its body: the search Worker is built from its source.
 */
export function scanText(
  text: string,
  pattern: RegExp,
  wholeWord: boolean,
  deadline: number,
): number[] | null {
  const word = /[\p{L}\p{N}\p{M}_]/u;
  const clock = typeof performance === "undefined" ? Date : performance;
  const high = (index: number) =>
    text.charCodeAt(index) >= 0xd800 && text.charCodeAt(index) <= 0xdbff;
  const low = (index: number) =>
    text.charCodeAt(index) >= 0xdc00 && text.charCodeAt(index) <= 0xdfff;
  const after = (index: number) => index + (high(index) && low(index + 1) ? 2 : 1);
  const before = (index: number) =>
    index >= 2 && low(index - 1) && high(index - 2) ? index - 2 : index - 1;
  const ranges: number[] = [];
  pattern.lastIndex = 0;
  for (let step = 1; ; step++) {
    const match = pattern.exec(text);
    if (!match) break;
    const from = match.index;
    const to = from + match[0].length;
    const bounded =
      !wholeWord ||
      ((from === 0 || !word.test(text.slice(before(from), from))) &&
        !word.test(text.slice(to, after(to))));
    if (to === from || !bounded) pattern.lastIndex = after(from);
    else ranges.push(from, to);
    if (step % 64 === 0 && clock.now() > deadline) return null;
    if (pattern.lastIndex > text.length) break;
  }
  return ranges;
}
