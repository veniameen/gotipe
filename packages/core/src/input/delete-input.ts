import {
  findBlockAndPreviousSibling,
  findBlockAndSibling,
  findBlockInTree,
  findParentBlock,
  isBlockEmpty,
} from "../document/tree";
import { expandRange, viewAtoms } from "../engine/atoms";
import type { Step } from "../types/state";
import { deletionBoundary } from "./delete-boundary";
import { hasSelection, replaceStructuredSelection } from "./selection-edit";
import { type InputHost, reportInputError, resolveSelectionForInput } from "./session";

function handleDelete(event: InputEvent, host: InputHost, direction: -1 | 1): void {
  event.preventDefault();
  const selection = resolveSelectionForInput(host);
  if (!selection.anchor.blockId) return;
  try {
    if (selection.type !== "text" || selection.anchor.blockId !== selection.head.blockId) {
      replaceStructuredSelection(host, selection, "delete");
      host.scheduleSelectionRestore();
      return;
    }
    const blockId = selection.anchor.blockId;
    const offset = selection.anchor.offset;
    const state = host.getViewState();
    const block = findBlockInTree(state.blocks, blockId);
    if (!block) return;
    const text = Array.isArray(block.content)
      ? block.content.map((span) => span.text).join("")
      : (block.content ?? "");
    let caret = { blockId, offset };
    const steps: Step[] = [];
    if (hasSelection(selection)) {
      const from = Math.min(offset, selection.head.offset);
      steps.push({
        type: "deleteText",
        blockId,
        from,
        to: Math.max(offset, selection.head.offset),
      });
      caret.offset = from;
    } else if (direction < 0 ? offset > 0 : offset < text.length) {
      const boundary = deletionBoundary(text, offset, direction, event.inputType);
      if (boundary === offset) return;
      // Deleting into an inline atom deletes all of it; the engine expands the step the same way.
      const atoms = Array.isArray(block.content) ? viewAtoms(block.content) : [];
      const { from, to } = expandRange(
        atoms,
        Math.min(offset, boundary),
        Math.max(offset, boundary),
      );
      steps.push({ type: "deleteText", blockId, from, to });
      caret.offset = from;
    } else {
      const parent = findParentBlock(state.blocks, blockId);
      const listItem =
        ["listItem", "todoItem"].includes(block.type) &&
        parent &&
        ["bulletList", "orderedList", "todoList"].includes(parent.parent.type);
      if (direction < 0 && listItem && !isBlockEmpty(block)) {
        host.handled = true;
        if (host.liftListItem()) {
          host.publishSelection();
          host.scheduleSelectionRestore();
          return;
        }
      }
      const sibling =
        direction < 0
          ? findBlockAndPreviousSibling(state.blocks, blockId)
          : findBlockAndSibling(state.blocks, blockId);
      const adjacent = sibling ? findBlockInTree(state.blocks, sibling.id) : null;
      if (!adjacent) return;
      // Structural containers and media retain their boundaries. Merge compatible text only.
      if (
        adjacent.content === null &&
        !["paragraph", "heading", "listItem", "todoItem"].includes(adjacent.type)
      )
        return;
      if (direction < 0) {
        const length = Array.isArray(adjacent.content)
          ? adjacent.content.reduce((sum, span) => sum + span.text.length, 0)
          : (adjacent.content?.length ?? 0);
        steps.push({ type: "mergeBlocks", blockId, targetId: adjacent.id });
        caret = { blockId: adjacent.id, offset: length };
      } else steps.push({ type: "mergeBlocks", blockId: adjacent.id, targetId: blockId });
    }
    if (!steps.length) return;
    host.handled = true;
    // Text deleted inside the block goes on with the deleting step; joining blocks is a step
    // of its own.
    const typing = steps[0]!.type === "deleteText" ? "delete" : undefined;
    host.dispatch({ steps, selection: { type: "cursor", ...caret } }, typing);
    host.scheduleSelectionRestore();
  } catch (error) {
    reportInputError(host, error);
  }
}

export function handleBackwardDelete(event: InputEvent, host: InputHost): void {
  handleDelete(event, host, -1);
}
export function handleForwardDelete(event: InputEvent, host: InputHost): void {
  handleDelete(event, host, 1);
}
