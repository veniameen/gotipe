import { type HtmlBlock, blocksToHtml } from "../serialization/html";
import type { FallbackBlock, FallbackDoc } from "./types";

function canonicalBlock(block: FallbackBlock): HtmlBlock {
  return {
    type: block.block_type,
    attrs: block.attrs,
    content:
      block.content.type === "RichText"
        ? block.content.value.map((span) => ({
            text: span.text,
            marks: span.marks.map((mark) => ({ type: mark.mark_type, attrs: mark.attrs })),
          }))
        : block.content.type === "Raw"
          ? block.content.value
          : null,
    children: block.children.map(canonicalBlock),
  };
}

export function fallbackExportHtml(docJson: string): string {
  const doc = JSON.parse(docJson) as FallbackDoc;
  return blocksToHtml(doc.blocks.map(canonicalBlock));
}
