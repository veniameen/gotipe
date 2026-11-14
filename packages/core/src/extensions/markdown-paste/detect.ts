const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const CLOSING_FENCE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*$/;
const BULLET = /^ {0,3}[-*+][ \t]+\S/;
const ORDERED = /^ {0,3}\d{1,9}[.)][ \t]+\S/;
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\S/;
const TASK = /^ {0,3}[-*+][ \t]+\[[ xX]\][ \t]+\S/;
const HEADING = /^ {0,3}#{1,6}[ \t]+\S/;
const QUOTE = /^ {0,3}>[ \t]?\S/;
const TABLE_DELIMITER = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/;
/**
 * A link or image to a web, mail, absolute, relative (`./`, `../`) or fragment address, not
 * glued to a name before it: `handlers[name](event)` and `note [1](2)` are not links. A
 * mention written as `[@Анна](mention:user-1)` counts when the editor has mentions.
 */
const link = (mentions: boolean) =>
  new RegExp(
    String.raw`(?:^|[^\p{L}\p{N}_$\])])!?\[[^\]\n]+\]\(<?(?:https?:\/\/|mailto:|\.{0,2}\/|#${mentions ? "|mention:" : ""})[^\s()<>]*>?(?:[ \t]+"[^"\n]*")?\)`,
    "u",
  );
/** Lines that read as source code or a shell command rather than prose. */
const CODE = [
  /[;{}][ \t]*$/,
  /^(?: {4}|\t)/,
  /^[ \t]*(?:import|export)[ \t]+[\w{*]/,
  /^[ \t]*(?:const|let|var)[ \t]+[\w$[{]+[ \t]*[=:;]/,
  /^[ \t]*(?:async[ \t]+)?(?:function|def|fn|func)\b[ \t]*\w*[ \t]*\(/,
  /^[ \t]*class[ \t]+\w+[ \t]*[({:]/,
  /^[ \t]*(?:return|yield|await|throw)[ \t]+\S/,
  /^[ \t]*(?:#include|#define|package[ \t]+[\w.]+[ \t]*$|using[ \t]+[\w.]+)/,
  /^[ \t]*(?:\$[ \t]+)?(?:npm|pnpm|npx|yarn|git|cd|sudo|pip|cargo|go|docker|brew|curl|wget)[ \t]+[-\w]/,
];

/** A line outside fences that looks like code; list items may be indented. */
const codeLine = (line: string) =>
  !LIST_ITEM.test(line) && CODE.some((pattern) => pattern.test(line));

/**
 * Whether pasted plain text is clearly Markdown rather than prose or code that happens to
 * contain a `#`, a `-` or brackets. Text with a line of code outside fences (an indented line,
 * a line ending in `;`, `{` or `}`, a declaration, a shell command) is not Markdown. Otherwise
 * one of these is enough: a closed code fence, a table with its delimiter row, a link or image
 * to a safe address, a task item, two list items in a row, two quoted lines, or two headings
 * that stand on their own lines (a blank line or the end follows each).
 */
export function looksLikeMarkdown(text: string, options: { mentions?: boolean } = {}): boolean {
  const LINK = link(options.mentions === true);
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let fence: string | null = null;
  let markdown = false;
  let headings = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const next = lines[index + 1];
    const marker = FENCE.exec(line)?.[1];
    if (marker && !fence) {
      fence = marker;
      continue;
    }
    if (fence) {
      if (
        marker &&
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        CLOSING_FENCE.test(line)
      ) {
        fence = null;
        markdown = true;
      }
      continue;
    }
    if (codeLine(line)) return false;
    if (TASK.test(line) || LINK.test(line)) markdown = true;
    if (next !== undefined && line.includes("|") && TABLE_DELIMITER.test(next)) markdown = true;
    if (next !== undefined && BULLET.test(line) && BULLET.test(next)) markdown = true;
    if (next !== undefined && ORDERED.test(line) && ORDERED.test(next)) markdown = true;
    if (next !== undefined && QUOTE.test(line) && QUOTE.test(next)) markdown = true;
    if (HEADING.test(line) && (next === undefined || !next.trim())) headings++;
  }
  return markdown || headings >= 2;
}
