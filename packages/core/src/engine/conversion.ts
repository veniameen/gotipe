import { decodeDocument } from "../document/decode";
import { toEngineSelection } from "../document/selection";
import type { Document } from "../types/block";
import type { Selection } from "../types/state";

// ---- Format conversion: JS ↔ Rust WASM ----
// JS uses:  { type, content: [...], marks: [{ type: 'bold' }] }
// Rust uses: { block_type, content: { type: "RichText", value: [...] }, marks: [{ mark_type: 'bold', attrs: {} }] }

function toWasmMark(mark: { type: string; attrs?: Record<string, unknown> }): {
  mark_type: string;
  attrs: Record<string, unknown>;
} {
  return { mark_type: mark.type, attrs: mark.attrs ?? {} };
}

function toWasmBlock(block: Record<string, unknown>): Record<string, unknown> {
  const content = block.content;
  let wasmContent: unknown;

  if (content === null || content === undefined) {
    wasmContent = { type: "Empty" };
  } else if (typeof content === "string") {
    wasmContent = { type: "Raw", value: content };
  } else if (Array.isArray(content)) {
    wasmContent = {
      type: "RichText",
      value: content.map(
        (span: { text: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }) => ({
          text: span.text,
          marks: (span.marks ?? []).map(toWasmMark),
        }),
      ),
    };
  } else {
    wasmContent = content;
  }

  const children = Array.isArray(block.children)
    ? (block.children as Record<string, unknown>[]).map(toWasmBlock)
    : [];

  return {
    id: block.id,
    block_type: block.type ?? block.block_type,
    attrs: block.attrs ?? {},
    content: wasmContent,
    children,
  };
}

export function toWasmDoc(value: unknown): Record<string, unknown> {
  const doc = decodeDocument(value);
  return { version: doc.version, blocks: doc.blocks.map((block) => toWasmBlock({ ...block })) };
}

export function fromWasmDoc(value: unknown): Document {
  return decodeDocument(value);
}

// ---- Transaction format conversion: JS step → Rust externally-tagged enum ----
// JS: { type: "insertText", blockId: "b1", offset: 5, text: "Hi", marks: [] }
// Rust: { "InsertText": { "block_id": "b1", "offset": 5, "text": "Hi", "marks": [] } }

function pascalCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toWasmStep(step: Record<string, unknown>): Record<string, unknown> {
  const type = step.type as string;
  const tag = pascalCase(type);

  switch (type) {
    case "insertText":
      return {
        [tag]: {
          block_id: step.blockId,
          offset: step.offset,
          text: step.text,
          marks: Array.isArray(step.marks)
            ? (step.marks as { type: string; attrs?: Record<string, unknown> }[]).map(toWasmMark)
            : [],
        },
      };
    case "deleteText":
      return { [tag]: { block_id: step.blockId, from: step.from, to: step.to } };
    case "insertBlock":
      return {
        [tag]: {
          parent_id: step.parentId ?? null,
          index: step.index,
          block: toWasmBlock(step.block as Record<string, unknown>),
        },
      };
    case "deleteBlock":
      return { [tag]: { block_id: step.blockId } };
    case "moveBlock":
      return {
        [tag]: {
          block_id: step.blockId,
          new_parent_id: step.newParentId ?? null,
          new_index: step.newIndex,
        },
      };
    case "setBlockAttrs":
      return { [tag]: { block_id: step.blockId, attrs: step.attrs } };
    case "setBlockType":
      return { [tag]: { block_id: step.blockId, new_type: step.newType, attrs: step.attrs ?? {} } };
    case "addMark": {
      const mark = step.mark as { type: string; attrs?: Record<string, unknown> };
      return {
        [tag]: {
          block_id: step.blockId,
          from: step.from,
          to: step.to,
          mark: toWasmMark(mark),
        },
      };
    }
    case "removeMark":
      return {
        [tag]: { block_id: step.blockId, from: step.from, to: step.to, mark_type: step.markType },
      };
    case "splitBlock":
      return { [tag]: { block_id: step.blockId, offset: step.offset } };
    case "mergeBlocks":
      return { [tag]: { block_id: step.blockId, target_id: step.targetId } };
    case "deleteRange":
      return { [tag]: { block_id: step.blockId, from: step.from, to: step.to } };
    default:
      return step;
  }
}

export function toWasmTransaction(tr: Record<string, unknown>): Record<string, unknown> {
  const steps = Array.isArray(tr.steps)
    ? (tr.steps as Record<string, unknown>[]).map(toWasmStep)
    : [];
  return {
    steps,
    selection: tr.selection ? toEngineSelection(tr.selection as Selection) : null,
    metadata: tr.metadata ?? {},
  };
}
