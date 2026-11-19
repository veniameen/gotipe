import type { SelectionView } from "@gotipe/core";
import { type MarkdownMap, textOffsetToMd, textRangeToMd } from "@gotipe/markdown";

/**
 * The editor's selection as `[start, end)` in the page's Markdown text: a text selection without
 * mark delimiters at its edges (`**bold**` selected is `bold`), selected blocks from the first
 * one's start to the last one's end. Null when the selection is not in the file (an empty title
 * the file does not hold yet).
 */
export function selectionMarkdownRange(
  map: MarkdownMap,
  selection: SelectionView,
): { start: number; end: number } | null {
  if (selection.type !== "text") {
    const ids = new Set(selection.blockIds ?? [selection.anchor.blockId, selection.head.blockId]);
    const blocks = map.blocks.filter((block) => ids.has(block.blockId));
    if (blocks.length === 0) return null;
    return {
      start: Math.min(...blocks.map((block) => block.start)),
      end: Math.max(...blocks.map((block) => block.end)),
    };
  }
  const { anchor, head } = selection;
  const a = textOffsetToMd(map, anchor.blockId, anchor.offset);
  const h = textOffsetToMd(map, head.blockId, head.offset);
  if (a === null || h === null) return null;
  // in document order: a selection made backwards has its head first
  const backwards = anchor.blockId === head.blockId ? head.offset < anchor.offset : h < a;
  return backwards ? textRangeToMd(map, head, anchor) : textRangeToMd(map, anchor, head);
}
