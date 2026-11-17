/**
 * Lines of a Markdown file as the signature window shows them: the count, which lines the
 * writer rewrote, and the few marks the source pane colours. Pure functions, no DOM.
 */

/** The file's lines; a final line break ends the last line instead of starting another. */
export function linesOf(text: string): string[] {
  const lines = text.split(/\r\n|\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** The file as a text field shows it: its final line break ends the last line, so it is left out. */
export function fieldOf(file: string): string {
  return file.replace(/\r?\n$/, "");
}

/** The file of a text field's text: a Markdown file ends with a line break. */
export function fileOf(field: string): string {
  return `${field}\n`;
}

/** The line (0-based) that holds `offset` in `text`. */
export function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split(/\r\n|\n/).length - 1;
}

/**
 * Which output lines are not byte-for-byte lines of the original, in order: the complement of a
 * longest common subsequence. An untouched block is copied by the writer, so its lines match.
 */
export function rewrittenLines(before: string[], after: string[]): Set<number> {
  const rows = before.length;
  const cols = after.length;
  const width = cols + 1;
  const table = new Uint16Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        before[i] === after[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  const kept = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      kept.add(j);
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) i += 1;
    else j += 1;
  }
  const rewritten = new Set<number>();
  for (let line = 0; line < cols; line += 1) if (!kept.has(line)) rewritten.add(line);
  return rewritten;
}

export interface SourcePiece {
  text: string;
  mark: boolean;
}

/** A heading line is all mark; elsewhere `**strong**` runs are. Just enough to read the source. */
export function piecesOf(line: string): SourcePiece[] {
  if (/^#{1,6}\s/.test(line)) return [{ text: line, mark: true }];
  const pieces: SourcePiece[] = [];
  const strong = /\*\*[^*]+\*\*/g;
  let last = 0;
  for (const match of line.matchAll(strong)) {
    const start = match.index ?? 0;
    if (start > last) pieces.push({ text: line.slice(last, start), mark: false });
    pieces.push({ text: match[0], mark: true });
    last = start + match[0].length;
  }
  if (last < line.length) pieces.push({ text: line.slice(last), mark: false });
  return pieces;
}

const NBSP = "\u00a0";

/**
 * «12 lines in · 12 lines out · 0 rewritten». Each phrase is held together by no-break spaces and
 * each dot by one to the phrase after it, so a narrow window wraps only before a dot: never between
 * a number and its word, and no dot is left hanging at the end of a line.
 */
export function lineSummary(before: number, after: number, rewritten: number): string {
  const lines = (count: number) => `${count}${NBSP}${count === 1 ? "line" : "lines"}`;
  return [
    `${lines(before)}${NBSP}in`,
    `${lines(after)}${NBSP}out`,
    `${rewritten}${NBSP}rewritten`,
  ].join(` ·${NBSP}`);
}
