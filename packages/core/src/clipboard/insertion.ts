import { createId } from "../document/id";
import { atomKeys, rekeyAtoms } from "../engine/atom-keys";
import { GoTipeError } from "../error";
import { blocksToText } from "../text";
import type { Block, Document, TextSpan } from "../types/block";
import type { SelectionView } from "../types/view";
import {
  type Caret,
  cloneWithFreshIds,
  entries,
  joinContent,
  paragraph,
  sliceContent,
  textOf,
} from "./document";
import { type ClipboardPayload, removeSelection } from "./selection";

const listParents = new Set(["bulletList", "orderedList", "todoList"]);
const cells = new Set(["tableCell", "tableHeader"]);

export function plainTextPayload(text: string): ClipboardPayload {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines.length === 1
    ? { spans: [{ text: text, marks: [] }] }
    : { blocks: lines.map((line) => paragraph(line)) };
}

function insertSpans(block: Block, offset: number, spans: TextSpan[]): Caret {
  const prefix = sliceContent(block.content, 0, offset);
  const suffix = sliceContent(block.content, offset);
  block.content = joinContent(joinContent(prefix, spans), suffix);
  return {
    blockId: block.id,
    offset: offset + spans.reduce((sum, span) => sum + span.text.length, 0),
  };
}

function paragraphsAsSpans(blocks: Block[]): TextSpan[] {
  return blocks.flatMap((block, index) => [
    ...(index ? [{ text: "\n", marks: [] }] : []),
    ...(Array.isArray(block.content)
      ? block.content
      : [{ text: textOf(block.content), marks: [] }]),
  ]);
}

/** Paste planning is pure. Parsing/schema validation precede the one transaction commit. */
export function insertPayload(
  document: Document,
  selection: SelectionView,
  payload: ClipboardPayload,
) {
  const removed = removeSelection(document, selection);
  if (!removed) throw new GoTipeError("CLIPBOARD_FAILED", "The paste selection is no longer valid");
  const target = entries(removed.document.blocks).find(
    ({ block }) => block.id === removed.caret.blockId,
  );
  if (!target) throw new GoTipeError("CLIPBOARD_FAILED", "The paste target no longer exists");
  const { block } = target;
  const offset = removed.caret.offset;
  // A pasted atom never shares a key with one already in the document (inline-atoms.md).
  const taken = atomKeys(removed.document.blocks);

  if ("spans" in payload) {
    const spans = structuredClone(payload.spans);
    rekeyAtoms(spans, taken);
    return { document: removed.document, caret: insertSpans(block, offset, spans) };
  }
  const incoming = payload.blocks.map(cloneWithFreshIds);
  for (const { block: pasted } of entries(incoming))
    if (Array.isArray(pasted.content)) rekeyAtoms(pasted.content, taken);
  if (!incoming.length) return removed;
  if (typeof block.content === "string") {
    return {
      document: removed.document,
      caret: insertSpans(block, offset, [{ text: blocksToText(incoming), marks: [] }]),
    };
  }
  const paragraphs = incoming.every(
    (entry) => entry.type === "paragraph" && !entry.children.length,
  );
  if ((incoming.length === 1 && paragraphs) || (cells.has(block.type) && paragraphs)) {
    return {
      document: removed.document,
      caret: insertSpans(block, offset, paragraphsAsSpans(incoming)),
    };
  }
  if (cells.has(block.type)) {
    throw new GoTipeError("CLIPBOARD_FAILED", "Paste structured blocks outside a table cell");
  }

  // Multiple lines in a list become sibling items, preserving the list and its nesting.
  if (target.parent && listParents.has(target.parent.type)) {
    let rows: Block[] | null = paragraphs
      ? incoming.map((entry) => ({
          ...entry,
          type: block.type,
          attrs: { ...block.attrs, ...(block.type === "todoItem" ? { checked: false } : {}) },
        }))
      : null;
    if (incoming.length === 1 && incoming[0]!.type === target.parent.type)
      rows = incoming[0]!.children;
    if (rows?.length) {
      const caret = replaceTextBlock(target.siblings, target.index, rows, offset);
      return { document: removed.document, caret };
    }
  }
  if (
    target.parent === null &&
    incoming[0]!.type === "paragraph" &&
    incoming.at(-1)!.type === "paragraph"
  ) {
    const caret = replaceTextBlock(target.siblings, target.index, incoming, offset);
    return { document: removed.document, caret };
  }

  // Structured inserts split the ancestor path, retaining all text before and after the caret.
  const [left, right] = splitAt(removed.document.blocks, block.id, offset);
  const last = entries(incoming)
    .filter(({ block: item }) => item.content !== null)
    .at(-1)?.block;
  let caret: Caret;
  if (last) caret = { blockId: last.id, offset: textOf(last.content).length };
  else {
    const trailing = paragraph();
    incoming.push(trailing);
    caret = { blockId: trailing.id, offset: 0 };
  }
  removed.document.blocks = [...left, ...incoming, ...right];
  return { document: removed.document, caret };
}

function replaceTextBlock(
  siblings: Block[],
  index: number,
  incoming: Block[],
  offset: number,
): Caret {
  const original = siblings[index]!;
  const first = incoming[0]!;
  const last = incoming.at(-1)!;
  first.id = original.id;
  first.type = original.type;
  first.attrs = { ...original.attrs };
  first.content = joinContent(sliceContent(original.content, 0, offset), first.content);
  const caret = { blockId: last.id, offset: textOf(last.content).length };
  last.content = joinContent(last.content, sliceContent(original.content, offset));
  last.children.push(...original.children);
  siblings.splice(index, 1, ...incoming);
  return caret;
}

function splitAt(blocks: Block[], id: string, offset: number): [Block[], Block[]] {
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!;
    if (block.id === id) {
      const prefix = { ...block, content: sliceContent(block.content, 0, offset), children: [] };
      const suffix = {
        ...block,
        id: createId(),
        content: sliceContent(block.content, offset),
      };
      return [
        [...blocks.slice(0, index), ...(textOf(prefix.content) ? [prefix] : [])],
        [
          ...(textOf(suffix.content) || suffix.children.length ? [suffix] : []),
          ...blocks.slice(index + 1),
        ],
      ];
    }
    if (entries(block.children).some(({ block: child }) => child.id === id)) {
      const [before, after] = splitAt(block.children, id, offset);
      const left = { ...block, children: before };
      const right = {
        ...block,
        id: createId(),
        content: sliceContent(block.content, 0, 0),
        children: after,
      };
      return [
        [...blocks.slice(0, index), ...(before.length || textOf(left.content) ? [left] : [])],
        [...(after.length ? [right] : []), ...blocks.slice(index + 1)],
      ];
    }
  }
  throw new GoTipeError("CLIPBOARD_FAILED", "The paste target no longer exists");
}
