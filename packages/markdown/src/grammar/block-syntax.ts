import { type Line, indentWidth } from "./source";

export interface ListMarker {
  ordered: boolean;
  marker: string;
  start: number;
  prefix: number;
  indent: number;
  content: string;
}

export function listMarker(text: string, column = 0): ListMarker | null {
  const match = /^( {0,3})([*+-]|\d{1,9}[.)])([ \t]+|$)(.*)$/.exec(text);
  if (!match) return null;
  const marker = match[2]!;
  const whitespace = match[3]!;
  const before = match[1]! + marker;
  const padding = indentWidth(" ".repeat(before.length) + whitespace, column) - before.length;
  const used = padding > 4 ? Math.min(1, whitespace.length) : whitespace.length;
  const prefix = before.length + used;
  return {
    ordered: marker.length > 1,
    marker: marker.at(-1)!,
    start: marker.length > 1 ? Number.parseInt(marker, 10) : 1,
    prefix,
    indent: before.length + (padding > 4 || !padding ? 1 : padding),
    content: text.slice(prefix),
  };
}

export const thematic = (text: string): boolean =>
  /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/.test(text);
export const atx = (text: string): RegExpExecArray | null =>
  /^ {0,3}(#{1,6})(?:[ \t]+(.*)|$)/.exec(text);
export const fence = (text: string): RegExpExecArray | null =>
  /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(text);
export const quotePrefix = (text: string): number => /^ {0,3}>[ \t]?/.exec(text)?.[0].length ?? 0;

const BLOCK_TAG =
  /^ {0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[ \t/>]|$)/i;

/** A terminator means the HTML block can contain blank lines; null means stop at a blank. */
export function htmlBlock(text: string, interrupt = false): RegExp | null | false {
  if (/^ {0,3}<!--/.test(text)) return /-->/;
  if (/^ {0,3}<\?/.test(text)) return /\?>/;
  if (/^ {0,3}<!\[CDATA\[/.test(text)) return /\]\]>/;
  if (/^ {0,3}<![A-Z]/.test(text)) return />/;
  const raw = /^ {0,3}<(script|pre|style|textarea)(?:[ \t>]|$)/i.exec(text);
  if (raw) return new RegExp(`</${raw[1]}>`, "i");
  if (BLOCK_TAG.test(text)) return null;
  if (
    !interrupt &&
    /^ {0,3}(?:<\/[A-Za-z][A-Za-z\d-]*\s*>|<[A-Za-z][A-Za-z\d-]*(?:\s+[A-Za-z_:][A-Za-z\d_.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>)[ \t]*$/.test(
      text,
    )
  )
    return null;
  return false;
}

export function interrupts(line: Line): boolean {
  const text = line.text;
  const marker = listMarker(text);
  const f = fence(text);
  return !!(
    atx(text) ||
    thematic(text) ||
    quotePrefix(text) ||
    (f && !(f[1]![0] === "`" && f[2]!.includes("`"))) ||
    (marker?.content.trim() && (!marker.ordered || marker.start === 1)) ||
    htmlBlock(text, true) !== false
  );
}
