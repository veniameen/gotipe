interface TextBlock {
  type: string;
  content: { text: string }[] | string | null;
  children: TextBlock[];
}

/** DOM offsets are UTF-16 code units, but an edit must not split a surrogate pair. */
export function isUtf16Boundary(text: string, offset: number): boolean {
  const previous = text.charCodeAt(offset - 1);
  const next = text.charCodeAt(offset);
  return !(previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff);
}

const graphemes =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** The deletion boundary for one visible character, including emoji sequences. */
export function adjacentGraphemeOffset(text: string, offset: number, direction: -1 | 1): number {
  if (graphemes) {
    let previous = 0;
    for (const segment of graphemes.segment(text)) {
      const end = segment.index + segment.segment.length;
      if (direction === -1 && offset <= end) return previous;
      if (direction === 1 && offset < end) return end;
      previous = end;
    }
    return direction === -1 ? previous : text.length;
  }
  let next = Math.max(0, Math.min(text.length, offset + direction));
  if (!isUtf16Boundary(text, next)) next += direction;
  return Math.max(0, Math.min(text.length, next));
}

/** Plain text in document order, including nested list items and table cells. */
export function blocksToText(blocks: TextBlock[]): string {
  const blockText = (block: TextBlock): string => {
    const own = Array.isArray(block.content)
      ? block.content.map((span) => span.text).join("")
      : (block.content ?? "");
    if (block.children.length === 0) return own;
    const children = block.children.map(blockText).join(block.type === "tableRow" ? "\t" : "\n");
    return own ? `${own}\n${children}` : children;
  };
  return blocks.map(blockText).join("\n");
}
