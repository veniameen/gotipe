import { createId } from "../document/id";
import type { Block, BlockContent, Document, TextSpan } from "../types/block";
import type { Transaction } from "../types/state";

export interface Caret {
  blockId: string;
  offset: number;
}
export interface BlockEntry {
  block: Block;
  parent: Block | null;
  siblings: Block[];
  index: number;
}

export function entries(blocks: Block[], parent: Block | null = null): BlockEntry[] {
  return blocks.flatMap((block, index) => [
    { block, parent, siblings: blocks, index },
    ...entries(block.children, block),
  ]);
}

export function textOf(content: BlockContent): string {
  return Array.isArray(content) ? content.map((span) => span.text).join("") : (content ?? "");
}

export function sliceContent(
  content: BlockContent,
  from: number,
  to = textOf(content).length,
): BlockContent {
  if (typeof content === "string") return content.slice(from, to);
  if (content === null) return null;
  let offset = 0;
  const result: TextSpan[] = [];
  for (const span of content) {
    const start = Math.max(0, from - offset);
    const end = Math.min(span.text.length, to - offset);
    if (end > start)
      result.push({ text: span.text.slice(start, end), marks: structuredClone(span.marks) });
    offset += span.text.length;
  }
  return result;
}

export function joinContent(left: BlockContent, right: BlockContent): BlockContent {
  if (typeof left === "string") return left + textOf(right);
  const spans: TextSpan[] = [];
  const incoming = typeof right === "string" ? [{ text: right, marks: [] }] : (right ?? []);
  for (const span of [...(left ?? []), ...incoming]) {
    const previous = spans.at(-1);
    if (previous && JSON.stringify(previous.marks) === JSON.stringify(span.marks))
      previous.text += span.text;
    else if (span.text) spans.push(structuredClone(span));
  }
  return spans;
}

export function paragraph(text = ""): Block {
  return {
    id: createId(),
    type: "paragraph",
    attrs: {},
    content: text ? [{ text, marks: [] }] : [],
    children: [],
  };
}

export function cloneWithFreshIds(block: Block): Block {
  return {
    ...structuredClone(block),
    id: createId(),
    children: block.children.map(cloneWithFreshIds),
  };
}

/** One transaction replaces only changed roots; untouched siblings retain identity and history. */
export function documentTransaction(before: Document, after: Document, caret: Caret): Transaction {
  const previous = new Map(before.blocks.map((block) => [block.id, JSON.stringify(block)]));
  const next = new Map(after.blocks.map((block) => [block.id, JSON.stringify(block)]));
  const changed = (id: string) => previous.get(id) !== next.get(id);
  return {
    steps: [
      ...before.blocks
        .filter((block) => changed(block.id))
        .map((block) => ({ type: "deleteBlock" as const, blockId: block.id })),
      ...after.blocks.flatMap((block, index) =>
        changed(block.id) ? [{ type: "insertBlock" as const, parentId: null, index, block }] : [],
      ),
    ],
    selection: { type: "cursor", ...caret },
  };
}
