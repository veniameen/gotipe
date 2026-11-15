import type { InlineContext } from "./links";
import { type Line, strip } from "./source";
import { type PhrasingContent, type Table, type TableCell, type TableRow, position } from "./types";

interface Cell {
  text: string;
  from: number;
  to: number;
  rawFrom: number;
  rawTo: number;
}

export function tableCells(text: string): Cell[] {
  const cells: Cell[] = [];
  let from = 0;
  for (let p = 0; p <= text.length; p++) {
    if (text[p] === "\\" && p + 1 < text.length) {
      p++;
      continue;
    }
    if (p === text.length || text[p] === "|") {
      const raw = text.slice(from, p);
      const leading = /^[ \t]*/.exec(raw)![0].length;
      // only spaces and tabs: a no-break space at an edge is text
      const value = raw.replace(/^[ \t]+|[ \t]+$/g, "");
      cells.push({
        text: value,
        from: from + leading,
        to: from + leading + value.length,
        rawFrom: from,
        rawTo: p,
      });
      from = p + 1;
    }
  }
  if (/^[ \t]*\|/.test(text)) cells.shift();
  if (/\|[ \t]*$/.test(text) && !/\\\|[ \t]*$/.test(text)) cells.pop();
  return cells;
}

export function tableAlignment(line: Line): Table["align"] | null {
  // without `|` a run of `-` is the underline of a setext heading (GFM): a colon makes it a row
  if (!line.text.includes("|") && !/^ {0,3}(?::-+:?|-+:)[ \t]*$/.test(line.text)) return null;
  const cells = tableCells(line.text);
  if (!cells.length || cells.some((cell) => !/^:?-+:?$/.test(cell.text))) return null;
  return cells.map((cell) =>
    cell.text.startsWith(":")
      ? cell.text.endsWith(":")
        ? "center"
        : "left"
      : cell.text.endsWith(":")
        ? "right"
        : null,
  );
}

export function tableRow(
  line: Line,
  columns: number,
  inline: (line: Line, context: Partial<InlineContext>) => PhrasingContent[],
): TableRow {
  const cells = tableCells(line.text).slice(0, columns);
  const children: TableCell[] = cells.map((cell) => {
    const content = strip(
      { ...line, text: line.text.slice(0, cell.to), end: line.start + cell.to },
      cell.from,
    );
    return {
      type: "tableCell",
      children: inline(content, { inCell: true }),
      position: position(
        line.offsets?.[cell.rawFrom] ?? line.start + cell.rawFrom,
        line.offsets?.[cell.rawTo] ?? line.start + cell.rawTo,
      ),
    };
  });
  while (children.length < columns)
    children.push({ type: "tableCell", children: [], position: position(line.end, line.end) });
  return { type: "tableRow", children, position: position(line.start, line.end) };
}
