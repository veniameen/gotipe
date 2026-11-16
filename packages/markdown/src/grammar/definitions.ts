import { punctuation, referenceLabel } from "./decode";
import { readDestination } from "./links";
import { type Line, blank, indentWidth, textStart } from "./source";
import { type Definition, position } from "./types";

function titleLines(
  first: string,
  lines: Line[],
  firstNext: number,
): { end: number; valid: boolean } {
  let next = firstNext;
  const open = first[0];
  if (open !== '"' && open !== "'" && open !== "(") return { end: next, valid: false };
  const close = open === "(" ? ")" : open;
  let text = first;
  let offset = 1;
  for (;;) {
    for (; offset < text.length; offset++) {
      if (text[offset] === "\\" && punctuation(text[offset + 1])) {
        offset++;
        continue;
      }
      if (text[offset] === close) return { end: next, valid: !text.slice(offset + 1).trim() };
      if (open === "(" && text[offset] === "(") return { end: next, valid: false };
    }
    if (next >= lines.length || blank(lines[next]!)) return { end: next, valid: false };
    text = lines[next++]!.text;
    offset = 0;
  }
}

export function readDefinition(
  lines: Line[],
  index: number,
  references: Set<string>,
): { node: Definition; end: number } | null {
  const line = lines[index]!;
  if (!/^ {0,3}\[/.test(line.text)) return null;
  let labelText = line.text;
  let end = index + 1;
  // Link labels may span lines, but are limited to 999 characters.
  while (
    !/(^|[^\\])\]/.test(labelText) &&
    labelText.length < 1005 &&
    end < lines.length &&
    !blank(lines[end]!)
  )
    labelText += `\n${lines[end++]!.text}`;
  const match = /^ {0,3}\[((?:\\.|[^\[\]\\]){1,999})\]:[ \t]*(.*)$/s.exec(labelText);
  if (!match || !match[1]!.trim()) return null;
  const label = match[1]!;
  const footnote = label.startsWith("^");
  if (footnote) {
    while (end < lines.length) {
      if (indentWidth(lines[end]!.text, lines[end]!.column) >= 4) end++;
      else if (
        blank(lines[end]!) &&
        end + 1 < lines.length &&
        indentWidth(lines[end + 1]!.text, lines[end + 1]!.column) >= 4
      )
        end++;
      else break;
    }
  } else {
    let value = match[2]!;
    if (!value && end < lines.length && !blank(lines[end]!)) value = lines[end++]!.text.trimStart();
    const destination = readDestination(value, 0);
    if (!destination || destination.end === 0) return null;
    const tail = value.slice(destination.end);
    if (tail && !/^[ \t]/.test(tail)) return null;
    if (tail.trim()) {
      const title = titleLines(tail.trimStart(), lines, end);
      if (!title.valid) return null;
      end = title.end;
    } else if (end < lines.length && /^[ \t]*["'(]/.test(lines[end]!.text)) {
      const title = titleLines(lines[end]!.text.trimStart(), lines, end + 1);
      if (title.valid) end = title.end;
    }
  }
  references.add(referenceLabel(label));
  return {
    node: {
      type: footnote ? "footnoteDefinition" : "definition",
      value: lines
        .slice(index, end)
        .map((l) => l.text)
        .join("\n"),
      position: position(textStart(line), lines[end - 1]!.end),
    },
    end,
  };
}
