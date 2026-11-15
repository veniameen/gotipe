import {
  type BlockEntry,
  documentTransaction,
  entries,
  paragraph,
  sliceContent,
  textOf,
} from "../clipboard/document";
import { removeSelection } from "../clipboard/selection";
import { createId } from "../document/id";
import { ENTER_EXITS_TO_PARAGRAPH_TYPES, findBlockInTree } from "../document/tree";
import { GoTipeError } from "../error";
import type { Block, Document } from "../types/block";
import { hasSelection } from "./selection-edit";
import { type InputHost, reportInputError, resolveSelectionForInput } from "./session";
import { insertInputText } from "./text-input";

/** Exit an empty row in place, retaining both halves of its list and any nesting. */
function exitEmptyList(
  document: Document,
  item: BlockEntry,
): { blockId: string; offset: number } | null {
  const list = item.parent;
  if (!list || !["bulletList", "orderedList", "todoList"].includes(list.type)) return null;
  const flat = entries(document.blocks);
  const listEntry = flat.find(({ block }) => block.id === list.id)!;
  const before = list.children.slice(0, item.index);
  const after = list.children.slice(item.index + 1);
  const parentRow = listEntry.parent;
  if (parentRow && ["listItem", "todoItem"].includes(parentRow.type)) {
    const parentEntry = flat.find(({ block }) => block.id === parentRow.id)!;
    const row: Block = {
      ...item.block,
      type: parentRow.type,
      attrs: { ...parentRow.attrs },
      content: [],
      children: [],
    };
    if (row.type === "todoItem") row.attrs.checked = false;
    if (after.length) row.children.push({ ...list, id: createId(), children: after });
    list.children = before;
    if (!before.length) listEntry.siblings.splice(listEntry.index, 1);
    parentEntry.siblings.splice(parentEntry.index + 1, 0, row);
    return { blockId: row.id, offset: 0 };
  }
  const empty = { ...paragraph(), id: item.block.id };
  const replacement: Block[] = [];
  if (before.length) replacement.push({ ...list, children: before });
  replacement.push(empty);
  if (after.length)
    replacement.push({
      ...list,
      id: before.length ? createId() : list.id,
      children: after,
    });
  listEntry.siblings.splice(listEntry.index, 1, ...replacement);
  return { blockId: empty.id, offset: 0 };
}

/**
 * Enter: a line break in raw text — a code block, a formula, a `rawText` node of yours (D-11);
 * a type the schema does not declare goes by what it holds. Elsewhere the block splits.
 */
export function handleParagraphInput(event: InputEvent, host: InputHost): void {
  event.preventDefault();
  const selection = resolveSelectionForInput(host);
  if (!selection.anchor.blockId) return;
  const block = findBlockInTree(host.getViewState().blocks, selection.anchor.blockId);
  const kind =
    block && (host.content(block.type) ?? (typeof block.content === "string" && "rawText"));
  if (kind === "rawText") {
    insertInputText("\n", host);
    return;
  }
  try {
    const before = host.getDocument();
    const removed = hasSelection(selection)
      ? removeSelection(before, selection)
      : {
          document: structuredClone(before),
          caret: { ...selection.anchor },
        };
    if (!removed) throw new GoTipeError("TRANSFORM_ERROR", "The selection is no longer valid");
    const flat = entries(removed.document.blocks);
    const current = flat.find(({ block }) => block.id === removed.caret.blockId);
    if (!current) return;
    const { block } = current;
    let caret = removed.caret;
    if (["tableCell", "tableHeader"].includes(block.type)) {
      const row = current.parent && flat.find(({ block }) => block.id === current.parent!.id);
      const below = row?.parent?.children[row.index + 1]?.children[current.index];
      if (below) caret = { blockId: below.id, offset: 0 };
    } else {
      const exited =
        ["listItem", "todoItem"].includes(block.type) &&
        !textOf(block.content).trim() &&
        !block.children.length
          ? exitEmptyList(removed.document, current)
          : null;
      if (exited) caret = exited;
      else {
        const type = ENTER_EXITS_TO_PARAGRAPH_TYPES.has(block.type) ? "paragraph" : block.type;
        const next: Block = {
          id: createId(),
          type,
          attrs: type === block.type ? { ...block.attrs } : {},
          content: sliceContent(block.content, caret.offset) ?? [],
          children: [],
        };
        if (type === "todoItem") next.attrs.checked = false;
        block.content = sliceContent(block.content, 0, caret.offset) ?? [];
        current.siblings.splice(current.index + 1, 0, next);
        caret = { blockId: next.id, offset: 0 };
      }
    }
    host.handled = true;
    host.dispatch(documentTransaction(before, removed.document, caret));
    host.scheduleSelectionRestore();
  } catch (error) {
    reportInputError(host, error);
  }
}
