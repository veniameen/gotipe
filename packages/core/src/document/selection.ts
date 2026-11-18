import type { FallbackBlock, FallbackDoc } from "../engine/types";
import { GoTipeError } from "../error";
import { isUtf16Boundary } from "../text";
import type { Selection } from "../types/state";
import type { SelectionView } from "../types/view";

export function toEngineSelection(selection: Selection): Record<string, unknown> {
  switch (selection.type) {
    case "cursor":
      return { Cursor: { block_id: selection.blockId, offset: selection.offset } };
    case "text":
      return { Text: { block_id: selection.blockId, from: selection.from, to: selection.to } };
    case "range":
      return viewToEngineSelection({
        type: "text",
        anchor: selection.anchor,
        head: selection.head,
      });
    case "block":
      return { Block: { block_id: selection.blockId } };
    case "multi":
      return { Multi: { block_ids: selection.blockIds } };
  }
}

/** Native history stores the full directed DOM selection, including cross-block ranges. */
export function viewToEngineSelection(selection: SelectionView): Record<string, unknown> {
  if (selection.type === "multi") return { Multi: { block_ids: selection.blockIds ?? [] } };
  if (selection.type === "block") return { Block: { block_id: selection.anchor.blockId } };
  if (
    selection.anchor.blockId === selection.head.blockId &&
    selection.anchor.offset === selection.head.offset
  )
    return { Cursor: { block_id: selection.anchor.blockId, offset: selection.anchor.offset } };
  return {
    Range: {
      anchor: { block_id: selection.anchor.blockId, offset: selection.anchor.offset },
      head: { block_id: selection.head.blockId, offset: selection.head.offset },
    },
  };
}

export function engineToViewSelection(json: string, document: string): SelectionView {
  const selection = JSON.parse(json);
  if (selection.Range) {
    const point = (value: { block_id: string; offset: number }) =>
      validateSelection({ type: "cursor", blockId: value.block_id, offset: value.offset }, document)
        .anchor;
    return {
      type: "text",
      anchor: point(selection.Range.anchor),
      head: point(selection.Range.head),
    };
  }
  if (selection.Cursor)
    return validateSelection(
      { type: "cursor", blockId: selection.Cursor.block_id, offset: selection.Cursor.offset },
      document,
    );
  if (selection.Text)
    return validateSelection(
      {
        type: "text",
        blockId: selection.Text.block_id,
        from: selection.Text.from,
        to: selection.Text.to,
      },
      document,
    );
  if (selection.Block)
    return validateSelection({ type: "block", blockId: selection.Block.block_id }, document);
  if (selection.Multi)
    return validateSelection({ type: "multi", blockIds: selection.Multi.block_ids }, document);
  throw new GoTipeError("COLLABORATION_ERROR", "Unknown native selection");
}

/**
 * Validate an explicit transaction selection against the complete staged document: its state
 * text, or the parsed state, which is only read.
 */
export function validateSelection(
  selection: Selection,
  state: string | FallbackDoc,
): SelectionView {
  const doc = typeof state === "string" ? (JSON.parse(state) as FallbackDoc) : state;
  // the last block with the id, as a map filled in document order would hold
  const find = (children: FallbackBlock[], id: string): FallbackBlock | undefined => {
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const block = children[index]!;
      const found = find(block.children, id) ?? (block.id === id ? block : undefined);
      if (found) return found;
    }
  };
  const textOf = (id: string): string => {
    const block = find(doc.blocks, id);
    if (!block) throw new GoTipeError("TRANSFORM_ERROR", `Selection block not found: ${id}`);
    return block.content.type === "RichText"
      ? block.content.value.map((span) => span.text).join("")
      : block.content.type === "Raw"
        ? block.content.value
        : "";
  };
  const point = (blockId: string, offset: number) => {
    const text = textOf(blockId);
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > text.length ||
      !isUtf16Boundary(text, offset)
    )
      throw new GoTipeError(
        "TRANSFORM_ERROR",
        "Selection offset out of range or splits a Unicode character",
      );
    return { blockId, offset };
  };
  if (!selection || typeof selection !== "object")
    throw new GoTipeError("TRANSFORM_ERROR", "Invalid selection");
  switch (selection.type) {
    case "range":
      return {
        type: "text",
        anchor: point(selection.anchor.blockId, selection.anchor.offset),
        head: point(selection.head.blockId, selection.head.offset),
      };
    case "cursor": {
      const caret = point(selection.blockId, selection.offset);
      return { type: "text", anchor: caret, head: { ...caret } };
    }
    case "text": {
      if (selection.to < selection.from)
        throw new GoTipeError("TRANSFORM_ERROR", "Selection range is reversed");
      return {
        type: "text",
        anchor: point(selection.blockId, selection.from),
        head: point(selection.blockId, selection.to),
      };
    }
    case "block": {
      const caret = point(selection.blockId, 0);
      return { type: "block", anchor: caret, head: { ...caret } };
    }
    case "multi": {
      if (
        !Array.isArray(selection.blockIds) ||
        !selection.blockIds.length ||
        new Set(selection.blockIds).size !== selection.blockIds.length
      )
        throw new GoTipeError("TRANSFORM_ERROR", "Invalid selected block IDs");
      selection.blockIds.forEach(textOf);
      const first = selection.blockIds[0]!;
      const last = selection.blockIds.at(-1)!;
      return {
        type: "multi",
        blockIds: selection.blockIds.slice(),
        anchor: point(first, 0),
        head: point(last, textOf(last).length),
      };
    }
    default:
      throw new GoTipeError("TRANSFORM_ERROR", "Unsupported selection type");
  }
}
