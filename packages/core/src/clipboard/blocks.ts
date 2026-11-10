import type { Block, Document } from "../types/block";
import type { SelectionView } from "../types/view";
import { entries, sliceContent } from "./document";

export function selectedBlockIds(document: Document, selection: SelectionView): Set<string> | null {
  const ids = selection.type === "block" ? [selection.anchor.blockId] : selection.blockIds;
  if (!ids?.length) return null;
  const known = new Set(entries(document.blocks).map(({ block }) => block.id));
  return ids.every((id) => known.has(id)) ? new Set(ids) : null;
}

/** Keep required list/table wrappers around selected descendants. */
export function selectedBlockTree(blocks: Block[], selected: Set<string>): Block[] {
  return blocks.flatMap((block) => {
    if (selected.has(block.id)) return [structuredClone(block)];
    const children = selectedBlockTree(block.children, selected);
    return children.length
      ? [{ ...structuredClone(block), content: sliceContent(block.content, 0, 0), children }]
      : [];
  });
}

export function deleteSelectedBlocks(blocks: Block[], selected: Set<string>): Block[] {
  return blocks.flatMap((block) => {
    if (selected.has(block.id)) {
      if (block.type === "tableCell" || block.type === "tableHeader")
        return [{ ...block, content: [], children: [] }];
      return [];
    }
    return [{ ...block, children: deleteSelectedBlocks(block.children, selected) }];
  });
}
