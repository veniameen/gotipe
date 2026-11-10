import { type ListMarker, interrupts, listMarker, thematic } from "./block-syntax";
import { type Line, blank, indentWidth, strip, stripIndent } from "./source";
import { type List, type ListItem, type RootContent, position } from "./types";

const compatible = (a: ListMarker, b: ListMarker): boolean =>
  a.ordered === b.ordered && a.marker === b.marker;

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
    let next = cursor + 1;
    let separated = false;
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
        separated = true;
        itemSpread = true;
        itemLines.push({ ...line, text: "", start: line.end });
        continue;
      }
      if (indentWidth(line.text) >= marker.indent) {
        itemLines.push(stripIndent(line, marker.indent));
        itemEnd = line.end;
        continue;
      }
      if (listMarker(line.text) || separated || interrupts(line)) break;
      // Lazy continuation of the item's initial paragraph.
      itemLines.push({ ...stripIndent(line, indentWidth(line.text, line.column)), lazy: true });
      itemEnd = line.end;
    }
    const task = /^\[([ xX])\](?:[ \t]|$)/.exec(itemLines[0]!.text);
    let content = parse(itemLines, task?.[0].length ?? 0);
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
      position: position(first.start + /^ */.exec(first.text)![0].length, itemEnd),
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
      position: position(
        lines[start]!.start + /^ */.exec(lines[start]!.text)![0].length,
        endOffset,
      ),
    },
    end: cursor,
  };
}
