import type { AttrValue, Block, Mark } from "./block";

export interface EditorState {
  doc: { blocks: Block[]; version: number };
  selection: Selection;
}

export type Selection =
  | { type: "cursor"; blockId: string; offset: number }
  | { type: "text"; blockId: string; from: number; to: number }
  | { type: "block"; blockId: string }
  | { type: "multi"; blockIds: string[] };

export interface Transaction {
  steps: Step[];
  selection?: Selection;
  metadata?: Record<string, AttrValue>;
}

export type Step =
  | { type: "insertText"; blockId: string; offset: number; text: string; marks: Mark[] }
  | { type: "deleteText"; blockId: string; from: number; to: number }
  | { type: "insertBlock"; parentId: string | null; index: number; block: Block }
  | { type: "deleteBlock"; blockId: string }
  | { type: "moveBlock"; blockId: string; newParentId: string | null; newIndex: number }
  | { type: "setBlockAttrs"; blockId: string; attrs: Record<string, AttrValue> }
  | { type: "setBlockType"; blockId: string; newType: string; attrs: Record<string, AttrValue> }
  | { type: "addMark"; blockId: string; from: number; to: number; mark: Mark }
  | { type: "removeMark"; blockId: string; from: number; to: number; markType: string }
  | { type: "splitBlock"; blockId: string; offset: number }
  | { type: "mergeBlocks"; blockId: string; targetId: string }
  | { type: "deleteRange"; blockId: string; from: number; to: number };

export type TransformError =
  | { code: "BLOCK_NOT_FOUND"; blockId: string }
  | { code: "OFFSET_OUT_OF_RANGE" }
  | { code: "INVALID_CONTENT_TYPE" }
  | { code: "CYCLE_DETECTED" }
  | { code: "INVALID_STEP"; message: string };
