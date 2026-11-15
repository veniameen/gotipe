import { htmlEnd, openingFence } from "../grammar/block-syntax";
import { readBlockNodes } from "../grammar/blocks";

/** A line that starts a fence or HTML: only such a block can take in what follows a blank line. */
const OPENER = /(?:^|[\r\n]) {0,3}(?:`{3}|~{3}|<)/;

/**
 * Where the block that ends `text` starts when it takes in a paragraph after a blank line: a fence
 * or HTML that ends only at its own end and has none runs on to the end of the file.
 */
function runsOnFrom(text: string, eol: string): number | null {
  const probe = text.length + 2 * eol.length;
  const start = readBlockNodes(`${text}${eol}${eol}x`).at(-1)?.position?.start.offset;
  return start === undefined || start >= probe ? null : start;
}

/**
 * The line that ends `md`, a block written after the blanks `indent`, where another block follows
 * it (D-106): a block that the end of its file ended reads the next block as its part. A fence gets
 * the fence of its opening line, and HTML its end (`-->`, `?>`, `]]>`, `>`, `</pre>`…) on a line
 * of its own; "" for a block that ends by itself.
 */
export function closingLine(md: string, indent: string, eol: string): string {
  const text = indent + md;
  if (!OPENER.test(text)) return "";
  const start = runsOnFrom(text, eol);
  if (start === null) return "";
  const line = /[^\r\n]*/y;
  line.lastIndex = start;
  const opening = line.exec(text)![0];
  const fence = openingFence(opening);
  const end = fence ? null : htmlEnd(opening);
  // a line feed after the lone `\r` that ends the block would join it into one line ending
  const brk = eol === "\n" && md.endsWith("\r") ? "\r" : eol;
  let closer = "";
  if (fence) closer = brk + fence[1];
  else if (typeof end === "string") closer = (/[\r\n]$/.test(md) ? "" : eol) + end;
  return closer && runsOnFrom(text + closer, eol) === null ? closer : "";
}
