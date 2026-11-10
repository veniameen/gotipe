import { type Position, position } from "./types";

export interface Line {
  text: string;
  start: number;
  end: number;
  offsets?: number[];
  column?: number;
  lazy?: boolean;
  eol?: string;
}
export interface Source {
  text: string;
  offsets: number[];
}

export function linesFrom(text: string): Line[] {
  const lines: Line[] = [];
  const re = /[^\r\n]*(?:\r\n|\r|\n|$)/g;
  for (const match of text.matchAll(re)) {
    if (!match[0]) break;
    const value = match[0].replace(/[\r\n]+$/, "");
    lines.push({
      text: value,
      start: match.index!,
      end: match.index! + value.length,
      eol: match[0].slice(value.length),
    });
  }
  return lines;
}

export function strip(line: Line, count: number): Line {
  let column = line.column ?? 0;
  for (const char of line.text.slice(0, count)) column += char === "\t" ? 4 - (column % 4) : 1;
  return {
    ...line,
    text: line.text.slice(count),
    start: line.offsets?.[count] ?? line.start + count,
    offsets: line.offsets?.slice(count),
    column,
  };
}

export function sourceFrom(lines: Line[]): Source {
  let text = "";
  const offsets: number[] = [];
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!;
    if (n) {
      text += "\n";
      offsets.push(lines[n - 1]!.end);
    }
    for (let i = 0; i < line.text.length; i++) offsets.push(line.offsets?.[i] ?? line.start + i);
    text += line.text;
  }
  offsets.push(lines.at(-1)?.end ?? 0);
  return { text, offsets };
}

export function sliceSource(source: Source, start: number, end = source.text.length): Source {
  return { text: source.text.slice(start, end), offsets: source.offsets.slice(start, end + 1) };
}

export function range(source: Source, start: number, end: number): Position {
  return position(source.offsets[start] ?? 0, source.offsets[end] ?? source.offsets.at(-1) ?? 0);
}

export function indentWidth(text: string, column = 0): number {
  let width = column;
  for (const c of text) {
    if (c === " ") width++;
    else if (c === "\t") width += 4 - (width % 4);
    else break;
  }
  return width - column;
}

export function stripIndent(line: Line, width: number): Line {
  let used = 0;
  let count = 0;
  while (count < line.text.length && used < width) {
    const c = line.text[count];
    if (c === " ") used++;
    else if (c === "\t") used += 4 - (((line.column ?? 0) + used) % 4);
    else break;
    count++;
  }
  const result = strip(line, count);
  if (used <= width) return result;
  const remaining = used - width;
  const offset = line.offsets?.[count - 1] ?? line.start + count - 1;
  const offsets = Array.from({ length: remaining }, () => offset);
  for (let i = 0; i <= result.text.length; i++)
    offsets.push(result.offsets?.[i] ?? result.start + i);
  return {
    ...result,
    text: " ".repeat(remaining) + result.text,
    start: offset,
    offsets,
    column: (line.column ?? 0) + width,
  };
}

export const blank = (line: Line): boolean => /^[ \t]*$/.test(line.text);
