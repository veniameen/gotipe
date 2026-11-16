import { type ListMarker, interrupts, listMarker, thematic } from "./block-syntax";
import { type Line, blank, indentWidth, strip, stripIndent, textStart } from "./source";
import { type List, type ListItem, type RootContent, position } from "./types";

const compatible = (a: ListMarker, b: ListMarker): boolean =>
  a.ordered === b.ordered && a.marker === b.marker;

type Block = RootContent | ListItem;
const startOf = (node: Block): number => node.position?.start.offset ?? 0;
const DEFINITIONS = new Set(["definition", "footnoteDefinition"]);
/** Blocks read from paragraph text: a lazy line is never the first line of an ATX heading. */
const PARAGRAPH_TEXT = new Set(["paragraph", "heading", ...DEFINITIONS]);

/** The last of `nodes`, in source order, that starts at or before `offset`; -1 when none does. */
function lastFrom(nodes: readonly Block[], offset: number): number {
  let low = 0;
  let high = nodes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (startOf(nodes[middle]!) <= offset) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

/**
 * How `nodes`, the content of an item or a quote, read a lazy line whose text starts at `offset`:
 * as text of a paragraph open before it, the only block a lazy line continues in CommonMark
 * (`"text"`); as the start of their block at the returned index; or else (`"other"`): in code, a
 * table, or a block nested deeper. A definition is read out of paragraph text, so a line right
 * after one continues that text, whatever block it starts here; so does the head row of a table
 * that ends a paragraph (D-216).
 */
export function lazyReading(
  nodes: readonly Block[],
  offset: number,
  top: boolean,
): number | "text" | "other" {
  const at = lastFrom(nodes, offset);
  const node = nodes[at];
  if (!node) return "other";
  if (startOf(node) === offset) {
    if (DEFINITIONS.has(nodes[at - 1]?.type ?? "") || (node.type === "table" && node.afterText))
      return "text";
    return top ? at : "other";
  }
  if ((node.position?.end.offset ?? 0) < offset) return "other";
  if (PARAGRAPH_TEXT.has(node.type)) return "text";
  if (node.type === "list" || node.type === "listItem" || node.type === "blockquote")
    return lazyReading(node.children, offset, false);
  return "other";
}

export function readList(
  lines: Line[],
  start: number,
  parse: (lines: Line[], taskPrefix: number) => RootContent[],
): { node: List; end: number } {
  const initial = listMarker(lines[start]!.text)!;
  const children: ListItem[] = [];
  let cursor = start;
  let spread = false;
  let endOffset = lines[start]!.end;
  while (cursor < lines.length) {
    const first = lines[cursor]!;
    const marker = listMarker(first.text, first.column);
    if (!marker || !compatible(initial, marker) || thematic(first.text)) break;
    const markerWidth = /^( {0,3})([*+-]|\d{1,9}[.)])/.exec(first.text)![0].length;
    const itemLines = [stripIndent(strip(first, markerWidth), marker.indent - markerWidth)];
    const spreadBefore: boolean = spread;
    // the first line of each run of lazy lines: its index in the item and in `lines`
    const lazy: { at: number; next: number }[] = [];
    let run = false;
    let next = cursor + 1;
    // the first blank line between the lines of the item: from it on the item is loose
    let firstBlank = -1;
    let itemSpread = false;
    let itemEnd = first.end;
    for (; next < lines.length; next++) {
      const line = lines[next]!;
      if (blank(line)) {
        let after = next + 1;
        while (after < lines.length && blank(lines[after]!)) after++;
        if (after === lines.length) break;
        const following = lines[after]!;
        const followingMarker = listMarker(following.text);
        if (
          followingMarker &&
          compatible(initial, followingMarker) &&
          indentWidth(following.text) < marker.indent
        ) {
          spread = true;
          next = after;
          break;
        }
        if (itemLines.every(blank)) break;
        if (indentWidth(following.text) < marker.indent) break;
        if (firstBlank < 0) firstBlank = itemLines.length;
        itemSpread = true;
        itemLines.push({ ...line, text: "", start: line.end });
        continue;
      }
      // A lazy line, of the item or of a quote around it, keeps its blanks: cmark-gfm keeps them
      // in the paragraph, and a row that heads a table counts them (D-245)
      if (indentWidth(line.text) >= marker.indent) {
        itemLines.push(line.lazy ? line : stripIndent(line, marker.indent));
        itemEnd = line.end;
        run = false;
        continue;
      }
      // after a blank line too: what the content reads as text stays in the item (D-121)
      if (listMarker(line.text) || interrupts(line)) break;
      // Lazy continuation of the item's initial paragraph, checked once the item is read.
      if (!run) lazy.push({ at: itemLines.length, next });
      run = true;
      itemLines.push({ ...line, lazy: true });
      itemEnd = line.end;
    }
    const task = /^\[([ xX])\](?:[ \t]|$)/.exec(itemLines[0]!.text);
    const prefix = task?.[0].length ?? 0;
    let content = parse(itemLines, prefix);
    // A lazy line continues the paragraph the item has open. Where the item reads it otherwise —
    // after an empty item or a heading, in code or a table — the item ends before it, as in
    // CommonMark (D-101); its blocks before that line read the same without it.
    for (const { at, next: stray } of lazy) {
      const reading = lazyReading(content, textStart(itemLines[at]!), true);
      if (reading === "text") continue;
      itemLines.length = at;
      content = typeof reading === "number" ? content.slice(0, reading) : parse(itemLines, prefix);
      itemEnd = itemLines.at(-1)!.end;
      itemSpread = firstBlank >= 0 && firstBlank < at;
      spread = spreadBefore;
      next = stray;
      break;
    }
    if (task && content.length === 0)
      content = [
        {
          type: "paragraph",
          children: [],
          position: position(itemLines[0]!.start, itemLines[0]!.end),
        },
      ];
    children.push({
      type: "listItem",
      children: content,
      checked: task ? task[1]!.toLowerCase() === "x" : null,
      spread: itemSpread,
      position: position(textStart(first), itemEnd),
    });
    endOffset = itemEnd;
    cursor = next;
  }
  return {
    node: {
      type: "list",
      ordered: initial.ordered,
      start: initial.ordered ? initial.start : null,
      spread,
      children,
      position: position(textStart(lines[start]!), endOffset),
    },
    end: cursor,
  };
}
