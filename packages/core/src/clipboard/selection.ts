import { isUtf16Boundary } from "../text";
import type { Block, Document, TextSpan } from "../types/block";
import type { SelectionView } from "../types/view";
import { deleteSelectedBlocks, selectedBlockIds, selectedBlockTree } from "./blocks";
import { type Caret, entries, joinContent, paragraph, sliceContent, textOf } from "./document";

export type ClipboardPayload = { spans: TextSpan[] } | { blocks: Block[] };
const fixedCells = new Set(["tableCell", "tableHeader"]);
const containers = new Set([
  "bulletList",
  "orderedList",
  "todoList",
  "table",
  "tableRow",
  "columns",
]);

function rangeOf(document: Document, selection: SelectionView) {
  const flat = entries(document.blocks);
  let from = flat.findIndex(({ block }) => block.id === selection.anchor.blockId);
  let to = flat.findIndex(({ block }) => block.id === selection.head.blockId);
  if (from < 0 || to < 0) return null;
  let start = selection.anchor.offset;
  let end = selection.head.offset;
  if (from > to || (from === to && start > end)) {
    [from, to] = [to, from];
    [start, end] = [end, start];
  }
  for (const [index, offset] of [
    [from, start],
    [to, end],
  ]) {
    if (flat[index!]!.block.content === null) return null;
    const text = textOf(flat[index!]!.block.content);
    if (
      !Number.isInteger(offset) ||
      offset! < 0 ||
      offset! > text.length ||
      !isUtf16Boundary(text, offset!)
    )
      return null;
  }
  return { flat, from, to, start, end };
}

/** Selection is clipped recursively, so nested lists/tables retain their container structure. */
export function copySelection(
  document: Document,
  selection: SelectionView,
): ClipboardPayload | null {
  const flat = entries(document.blocks);
  if (selection.type === "block" || selection.type === "multi") {
    const selected = selectedBlockIds(document, selection);
    return selected ? { blocks: selectedBlockTree(document.blocks, selected) } : null;
  }
  const range = rangeOf(document, selection);
  if (!range) return null;
  const { from, to, start, end } = range;
  if (from === to) {
    if (start === end) return null;
    const content = sliceContent(flat[from]!.block.content, start, end);
    return {
      spans: typeof content === "string" ? [{ text: content, marks: [] }] : (content ?? []),
    };
  }
  const indices = new Map(flat.map(({ block }, index) => [block.id, index]));
  const clip = (blocks: Block[]): Block[] =>
    blocks.flatMap((block) => {
      const index = indices.get(block.id)!;
      const children = clip(block.children);
      const included = index >= from && index <= to;
      if (!included && !children.length) return [];
      const content = included
        ? sliceContent(block.content, index === from ? start : 0, index === to ? end : undefined)
        : sliceContent(block.content, 0, 0);
      return [{ ...structuredClone(block), content, children }];
    });
  return { blocks: clip(document.blocks) };
}

/** Returns a new document and caret. The caller commits the whole change atomically. */
export function removeSelection(
  document: Document,
  selection: SelectionView,
): { document: Document; caret: Caret } | null {
  const copy = structuredClone(document);
  const flat = entries(copy.blocks);
  const occupied = new Set(
    flat.filter(({ block }) => block.children.length).map(({ block }) => block.id),
  );
  if (selection.type === "block" || selection.type === "multi") {
    const selected = selectedBlockIds(document, selection);
    if (!selected) return null;
    const entry = flat.find(({ block }) => selected.has(block.id));
    if (!entry) return null;
    copy.blocks = deleteSelectedBlocks(copy.blocks, selected);
    pruneContainers(copy.blocks, occupied);
    if (!copy.blocks.length) copy.blocks.push(paragraph());
    const remaining = entries(copy.blocks).filter(({ block }) => block.content !== null);
    const removedIndex = flat.indexOf(entry);
    const following = remaining.find(
      ({ block }) => flat.findIndex((item) => item.block.id === block.id) >= removedIndex,
    );
    const previous = remaining
      .filter(({ block }) => flat.findIndex((item) => item.block.id === block.id) < removedIndex)
      .at(-1);
    const next = following?.block ?? previous?.block ?? remaining[0]?.block;
    if (!next) {
      const empty = paragraph();
      copy.blocks.push(empty);
      return { document: copy, caret: { blockId: empty.id, offset: 0 } };
    }
    return {
      document: copy,
      caret: { blockId: next.id, offset: following ? 0 : textOf(next.content).length },
    };
  }
  const range = rangeOf(copy, selection);
  if (!range) return null;
  const { from, to, start, end } = range;
  const first = flat[from]!;
  const last = flat[to]!;
  if (from === to) {
    first.block.content = joinContent(
      sliceContent(first.block.content, 0, start),
      sliceContent(first.block.content, end),
    );
    return { document: copy, caret: { blockId: first.block.id, offset: start } };
  }
  const indices = new Map(flat.map(({ block }, index) => [block.id, index]));
  const cut = (blocks: Block[]): Block[] =>
    blocks.flatMap((block) => {
      const index = indices.get(block.id)!;
      const children = cut(block.children);
      let content = block.content;
      if (index === from) content = sliceContent(content, 0, start);
      else if (index === to) content = sliceContent(content, end);
      else if (index > from && index < to) {
        if (!children.length && !fixedCells.has(block.type)) return [];
        content = sliceContent(content, 0, 0);
      }
      return [{ ...block, content, children }];
    });
  copy.blocks = cut(copy.blocks);
  const current = entries(copy.blocks);
  const a = current.find(({ block }) => block.id === first.block.id)!;
  const b = current.find(({ block }) => block.id === last.block.id)!;
  if (
    a.parent?.id === b.parent?.id &&
    !fixedCells.has(a.block.type) &&
    !fixedCells.has(b.block.type) &&
    a.block.content !== null &&
    b.block.content !== null &&
    typeof a.block.content === typeof b.block.content
  ) {
    a.block.content = joinContent(a.block.content, b.block.content);
    a.block.children.push(...b.block.children);
    b.siblings.splice(b.index, 1);
  }
  pruneContainers(copy.blocks, occupied);
  return { document: copy, caret: { blockId: a.block.id, offset: start } };
}

function pruneContainers(blocks: Block[], occupied: Set<string>) {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!;
    pruneContainers(block.children, occupied);
    if (containers.has(block.type) && occupied.has(block.id) && !block.children.length)
      blocks.splice(i, 1);
  }
}
