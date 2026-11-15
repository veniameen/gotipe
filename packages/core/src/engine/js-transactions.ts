import { createId } from "../document/id";
import { GoTipeError } from "../error";
import { isUtf16Boundary } from "../text";
import { normalizeAtomStep } from "./atoms";
import {
  type MarkGroups,
  NO_MARK_GROUPS,
  applyMark,
  normalizeMarks,
  sameValue,
} from "./mark-rules";
import type { FallbackBlock, FallbackDoc, FallbackMark, FallbackSpan } from "./types";

function findBlockById(blocks: FallbackBlock[], id: string): FallbackBlock | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    const found = findBlockById(b.children, id);
    if (found) return found;
  }
  return null;
}

function requireBlock(doc: FallbackDoc, id: string): FallbackBlock {
  const block = findBlockById(doc.blocks, id);
  if (!block) throw new GoTipeError("TRANSFORM_ERROR", `Block not found: ${id}`);
  return block;
}

/** Mark steps need rich text: the Rust engine answers `InvalidContentType` otherwise. */
function requireRichText(doc: FallbackDoc, id: string): FallbackBlock {
  const block = requireBlock(doc, id);
  if (block.content.type !== "RichText") {
    throw new GoTipeError("TRANSFORM_ERROR", "Invalid content type for this operation");
  }
  return block;
}

function requireIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0) {
    throw new GoTipeError("TRANSFORM_ERROR", "Invalid block index");
  }
}

function promoteEmptyText(block: FallbackBlock): void {
  if (block.content.type !== "Empty" || EMPTY_CONTENT_TYPES.has(block.block_type)) return;
  block.content = RAW_CONTENT_TYPES.has(block.block_type)
    ? { type: "Raw", value: "" }
    : { type: "RichText", value: [] };
}

/** As in Rust, inserting or splitting gives an empty block text; deleting (`promote` off) does not. */
function requireTextRange(block: FallbackBlock, from: number, to = from, promote = true): void {
  if (promote) promoteEmptyText(block);
  if (block.content.type === "Empty") {
    throw new GoTipeError("TRANSFORM_ERROR", "Block does not contain text");
  }
  const text =
    block.content.type === "Raw"
      ? block.content.value
      : block.content.value.map((span) => span.text).join("");
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    to > text.length
  ) {
    throw new GoTipeError("TRANSFORM_ERROR", "Text offset out of range");
  }
  if (!isUtf16Boundary(text, from) || !isUtf16Boundary(text, to)) {
    throw new GoTipeError("TRANSFORM_ERROR", "Text offset splits a Unicode character");
  }
}

function marksEqual(a: FallbackMark[], b: FallbackMark[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.mark_type !== b[i]!.mark_type) return false;
    if (!sameValue(a[i]!.attrs ?? {}, b[i]!.attrs ?? {})) return false;
  }
  return true;
}

/** Normalize adjacent spans with identical marks into a single span. */
function normalizeSpans(spans: FallbackSpan[]): FallbackSpan[] {
  const result: FallbackSpan[] = [];
  for (const span of spans) {
    if (span.text === "") continue;
    const last = result[result.length - 1];
    if (last && marksEqual(last.marks, span.marks)) {
      last.text += span.text;
    } else {
      result.push({ text: span.text, marks: span.marks.map((m) => ({ ...m })) });
    }
  }
  return result;
}

function getRichTextSpans(block: FallbackBlock): FallbackSpan[] {
  if (block.content.type !== "RichText") return [];
  return block.content.value;
}

function setRichTextSpans(block: FallbackBlock, spans: FallbackSpan[]): void {
  block.content = { type: "RichText", value: normalizeSpans(spans) };
}

/** Split spans at a character offset, returning [before, after]. */
function splitSpansAt(spans: FallbackSpan[], offset: number): [FallbackSpan[], FallbackSpan[]] {
  const before: FallbackSpan[] = [];
  const after: FallbackSpan[] = [];
  let pos = 0;
  let splitDone = false;

  for (const span of spans) {
    const end = pos + span.text.length;
    if (splitDone) {
      after.push({ text: span.text, marks: span.marks.map((m) => ({ ...m })) });
    } else if (offset <= pos) {
      splitDone = true;
      after.push({ text: span.text, marks: span.marks.map((m) => ({ ...m })) });
    } else if (offset >= end) {
      before.push({ text: span.text, marks: span.marks.map((m) => ({ ...m })) });
    } else {
      // Split inside this span
      before.push({
        text: span.text.slice(0, offset - pos),
        marks: span.marks.map((m) => ({ ...m })),
      });
      after.push({ text: span.text.slice(offset - pos), marks: span.marks.map((m) => ({ ...m })) });
      splitDone = true;
    }
    pos = end;
  }
  return [before, after];
}

function applyInsertText(
  doc: FallbackDoc,
  step: { block_id: string; offset: number; text: string; marks: FallbackMark[] },
  groups: MarkGroups,
): void {
  const block = requireBlock(doc, step.block_id);
  requireTextRange(block, step.offset);
  if (block.content.type === "Raw") {
    const text = block.content.value;
    block.content.value = text.slice(0, step.offset) + step.text + text.slice(step.offset);
    return;
  }
  const spans = getRichTextSpans(block);
  const [before, after] = splitSpansAt(spans, step.offset);
  const newSpan: FallbackSpan = { text: step.text, marks: normalizeMarks(step.marks, groups) };
  setRichTextSpans(block, [...before, newSpan, ...after]);
}

function applyDeleteText(
  doc: FallbackDoc,
  step: { block_id: string; from: number; to: number },
): void {
  const block = requireBlock(doc, step.block_id);
  requireTextRange(block, step.from, step.to, false);
  if (block.content.type === "Raw") {
    const text = block.content.value;
    block.content.value = text.slice(0, step.from) + text.slice(step.to);
    return;
  }
  const spans = getRichTextSpans(block);
  const [beforeFrom] = splitSpansAt(spans, step.from);
  const [, afterTo] = splitSpansAt(spans, step.to);
  setRichTextSpans(block, [...beforeFrom, ...afterTo]);
}

function applyDeleteRange(
  doc: FallbackDoc,
  step: { block_id: string; from: number; to: number },
): void {
  applyDeleteText(doc, step);
}

function applyAddMark(
  doc: FallbackDoc,
  step: { block_id: string; from: number; to: number; mark: FallbackMark },
  groups: MarkGroups,
): void {
  const block = requireRichText(doc, step.block_id);
  requireTextRange(block, step.from, step.to);
  const spans = getRichTextSpans(block);
  const [beforeFrom, rest] = splitSpansAt(spans, step.from);
  const totalLen = rest.reduce((sum, s) => sum + s.text.length, 0);
  const rangeLen = step.to - step.from;
  const [middle, afterTo] = splitSpansAt(rest, Math.min(rangeLen, totalLen));

  // Same type: the new attributes replace the old; same exclusive group: the others go.
  for (const span of middle) span.marks = applyMark(span.marks, step.mark, groups);

  setRichTextSpans(block, [...beforeFrom, ...middle, ...afterTo]);
}

function applyRemoveMark(
  doc: FallbackDoc,
  step: { block_id: string; from: number; to: number; mark_type: string },
): void {
  const block = requireRichText(doc, step.block_id);
  requireTextRange(block, step.from, step.to);
  const spans = getRichTextSpans(block);
  const [beforeFrom, rest] = splitSpansAt(spans, step.from);
  const totalLen = rest.reduce((sum, s) => sum + s.text.length, 0);
  const rangeLen = step.to - step.from;
  const [middle, afterTo] = splitSpansAt(rest, Math.min(rangeLen, totalLen));

  for (const span of middle) {
    span.marks = span.marks.filter((m) => m.mark_type !== step.mark_type);
  }

  setRichTextSpans(block, [...beforeFrom, ...middle, ...afterTo]);
}

function removeBlockById(blocks: FallbackBlock[], id: string): boolean {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.id === id) {
      blocks.splice(i, 1);
      return true;
    }
    if (removeBlockById(blocks[i]!.children, id)) return true;
  }
  return false;
}

function applyInsertBlock(
  doc: FallbackDoc,
  step: { parent_id: string | null; index: number; block: FallbackBlock },
): void {
  requireIndex(step.index);
  const target = step.parent_id ? requireBlock(doc, step.parent_id).children : doc.blocks;
  const ids = new Set<string>();
  const visit = (block: FallbackBlock): void => {
    if (!block.id || ids.has(block.id) || findBlockById(doc.blocks, block.id)) {
      throw new GoTipeError("TRANSFORM_ERROR", `Duplicate or empty block ID: ${block.id}`);
    }
    ids.add(block.id);
    block.children.forEach(visit);
  };
  visit(step.block);
  target.splice(Math.min(step.index, target.length), 0, step.block);
}

function applyDeleteBlock(doc: FallbackDoc, step: { block_id: string }): void {
  requireBlock(doc, step.block_id);
  removeBlockById(doc.blocks, step.block_id);
}

/** Block types that use Raw (string) content. */
const RAW_CONTENT_TYPES = new Set(["codeBlock", "math", "markdownRaw"]);
/** Block types that use Empty content. */
const EMPTY_CONTENT_TYPES = new Set([
  "divider",
  "image",
  "file",
  "embed",
  "columns",
  "column",
  "table",
  "tableRow",
  "bulletList",
  "orderedList",
  "todoList",
]);

function applySetBlockType(
  doc: FallbackDoc,
  step: { block_id: string; new_type: string; attrs: Record<string, unknown> },
): void {
  const block = requireBlock(doc, step.block_id);
  block.block_type = step.new_type;
  block.attrs = step.attrs;

  // Convert content type when switching between block categories
  if (RAW_CONTENT_TYPES.has(step.new_type) && block.content.type !== "Raw") {
    // RichText/Empty → Raw: join span texts into a plain string
    const text =
      block.content.type === "RichText" ? block.content.value.map((s) => s.text).join("") : "";
    block.content = { type: "Raw", value: text };
  } else if (EMPTY_CONTENT_TYPES.has(step.new_type) && block.content.type !== "Empty") {
    block.content = { type: "Empty" };
  } else if (
    !RAW_CONTENT_TYPES.has(step.new_type) &&
    !EMPTY_CONTENT_TYPES.has(step.new_type) &&
    block.content.type === "Raw"
  ) {
    // Raw → RichText: wrap string in a single span
    const text = block.content.value;
    block.content = { type: "RichText", value: text ? [{ text, marks: [] }] : [] };
  }
}

function applySetBlockAttrs(
  doc: FallbackDoc,
  step: { block_id: string; attrs: Record<string, unknown> },
): void {
  Object.assign(requireBlock(doc, step.block_id).attrs, step.attrs);
}

function applyMoveBlock(
  doc: FallbackDoc,
  step: { block_id: string; new_parent_id: string | null; new_index: number },
): void {
  const block = requireBlock(doc, step.block_id);
  requireIndex(step.new_index);
  if (
    step.new_parent_id === step.block_id ||
    (step.new_parent_id && findBlockById(block.children, step.new_parent_id))
  ) {
    throw new GoTipeError("TRANSFORM_ERROR", "Cannot move a block into its own subtree");
  }
  // Resolve the destination before removing anything. Throwing leaves the
  // original bridge state intact, including previous steps in the transaction.
  const target = step.new_parent_id ? requireBlock(doc, step.new_parent_id).children : doc.blocks;
  removeBlockById(doc.blocks, step.block_id);
  target.splice(Math.min(step.new_index, target.length), 0, block);
}

function applySplitBlock(doc: FallbackDoc, step: { block_id: string; offset: number }): void {
  const block = requireBlock(doc, step.block_id);
  requireTextRange(block, step.offset);

  // Find block in parent array
  const findInParent = (blocks: FallbackBlock[]): { arr: FallbackBlock[]; idx: number } | null => {
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i]!.id === step.block_id) return { arr: blocks, idx: i };
      const found = findInParent(blocks[i]!.children);
      if (found) return found;
    }
    return null;
  };

  const loc = findInParent(doc.blocks);
  if (!loc) return;

  let newContent: FallbackBlock["content"];
  if (block.content.type === "Raw") {
    const text = block.content.value;
    block.content.value = text.slice(0, step.offset);
    newContent = { type: "Raw", value: text.slice(step.offset) };
  } else {
    const [before, after] = splitSpansAt(getRichTextSpans(block), step.offset);
    setRichTextSpans(block, before);
    newContent = { type: "RichText", value: normalizeSpans(after) };
  }
  const newBlock: FallbackBlock = {
    id: createId(),
    block_type: block.block_type === "heading" ? "paragraph" : block.block_type,
    attrs: block.block_type === "heading" ? {} : { ...block.attrs },
    content: newContent,
    children: [],
  };
  loc.arr.splice(loc.idx + 1, 0, newBlock);
}

function applyMergeBlocks(doc: FallbackDoc, step: { block_id: string; target_id: string }): void {
  const source = requireBlock(doc, step.block_id);
  const target = requireBlock(doc, step.target_id);
  if (
    source === target ||
    findBlockById(source.children, target.id) ||
    findBlockById(target.children, source.id)
  ) {
    throw new GoTipeError("TRANSFORM_ERROR", "Cannot merge a block with itself or an ancestor");
  }
  promoteEmptyText(source);
  promoteEmptyText(target);
  if (target.content.type === "Raw" && source.content.type === "Raw") {
    target.content.value += source.content.value;
  } else if (target.content.type === "RichText" && source.content.type === "RichText") {
    setRichTextSpans(target, [...target.content.value, ...source.content.value]);
  } else {
    throw new GoTipeError("TRANSFORM_ERROR", "Cannot merge incompatible content types");
  }
  target.children.push(...source.children);
  removeBlockById(doc.blocks, step.block_id);
}

/** `groups` are the schema's exclusive mark groups; the Rust engine reads them from its schema. */
export function fallbackApply(
  docJson: string,
  transactionJson: string,
  validateStep?: (step: Record<string, unknown>, document: FallbackDoc) => void,
  groups: MarkGroups = NO_MARK_GROUPS,
): string {
  const doc = JSON.parse(docJson) as FallbackDoc;
  const tr = JSON.parse(transactionJson) as { steps: Record<string, unknown>[] };

  const atomic = groups.atomic;
  for (const raw of tr.steps) {
    validateStep?.(raw, doc);
    // Offsets inside an atom move to its edges (atoms.ts); the Rust engine does the same.
    const step = atomic
      ? normalizeAtomStep(
          raw,
          (id) => findBlockById(doc.blocks, id),
          (type) => atomic.has(type),
        )
      : raw;
    // Steps are externally-tagged: { "InsertText": { ... } }
    const tag = Object.keys(step)[0]!;
    const data = step[tag] as Record<string, unknown>;

    switch (tag) {
      case "InsertText":
        applyInsertText(doc, data as Parameters<typeof applyInsertText>[1], groups);
        break;
      case "DeleteText":
        applyDeleteText(doc, data as Parameters<typeof applyDeleteText>[1]);
        break;
      case "AddMark":
        applyAddMark(doc, data as Parameters<typeof applyAddMark>[1], groups);
        break;
      case "RemoveMark":
        applyRemoveMark(doc, data as Parameters<typeof applyRemoveMark>[1]);
        break;
      case "InsertBlock":
        applyInsertBlock(doc, data as Parameters<typeof applyInsertBlock>[1]);
        break;
      case "DeleteBlock":
        applyDeleteBlock(doc, data as Parameters<typeof applyDeleteBlock>[1]);
        break;
      case "SetBlockType":
        applySetBlockType(doc, data as Parameters<typeof applySetBlockType>[1]);
        break;
      case "SetBlockAttrs":
        applySetBlockAttrs(doc, data as Parameters<typeof applySetBlockAttrs>[1]);
        break;
      case "MoveBlock":
        applyMoveBlock(doc, data as Parameters<typeof applyMoveBlock>[1]);
        break;
      case "SplitBlock":
        applySplitBlock(doc, data as Parameters<typeof applySplitBlock>[1]);
        break;
      case "MergeBlocks":
        applyMergeBlocks(doc, data as Parameters<typeof applyMergeBlocks>[1]);
        break;
      case "DeleteRange":
        applyDeleteRange(doc, data as Parameters<typeof applyDeleteRange>[1]);
        break;
      default:
        throw new GoTipeError("TRANSFORM_ERROR", `Unsupported transaction step: ${tag}`);
    }
  }

  return JSON.stringify(doc);
}
