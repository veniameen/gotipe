import { cloneAttributes } from "../document/attributes";
import { flattenBlocks } from "../document/tree";
import type { BlockView, ViewState } from "../types/view";
import type { CommandPort } from "./port";

interface TextRange {
  block: BlockView;
  from: number;
  to: number;
}
const length = (block: BlockView) =>
  Array.isArray(block.content) ? block.content.reduce((sum, span) => sum + span.text.length, 0) : 0;

function ranges(state: ViewState, from?: number, to?: number): TextRange[] {
  const blocks = flattenBlocks(state.blocks);
  const selection = state.selection;
  let start = selection.anchor;
  let end = selection.head;
  if (from !== undefined || to !== undefined) {
    start = { blockId: start.blockId, offset: from ?? Math.min(start.offset, end.offset) };
    end = {
      blockId: start.blockId,
      offset: to ?? Math.max(selection.anchor.offset, selection.head.offset),
    };
  }
  const a = blocks.findIndex((block) => block.id === start.blockId);
  const b = blocks.findIndex((block) => block.id === end.blockId);
  if (a < 0 || b < 0) return [];
  if (a > b || (a === b && start.offset > end.offset)) [start, end] = [end, start];
  const selected =
    selection.type === "multi"
      ? new Set(selection.blockIds)
      : selection.type === "block"
        ? new Set([selection.anchor.blockId])
        : null;
  return blocks.flatMap((block, index) => {
    if (selected ? !selected.has(block.id) : index < Math.min(a, b) || index > Math.max(a, b))
      return [];
    if (typeof block.content === "string") return [];
    return [
      {
        block,
        from: selected ? 0 : block.id === start.blockId ? start.offset : 0,
        to: selected ? length(block) : block.id === end.blockId ? end.offset : length(block),
      },
    ];
  });
}

function fullyMarked(range: TextRange, mark: string): boolean {
  let position = 0;
  if (!Array.isArray(range.block.content)) return false;
  return range.block.content.every((span) => {
    const start = position;
    position += span.text.length;
    return (
      position <= range.from || start >= range.to || span.marks.some((item) => item.type === mark)
    );
  });
}

/** Mark commands enumerate all selected text blocks without changing selection direction. */
export class MarkCommands {
  constructor(private port: CommandPort) {}
  toggle(markType: string, attrs?: Record<string, unknown>): void {
    const state = this.port.getState();
    const selection = ranges(state);
    const collapsed = selection.length === 1 && selection[0]!.from === selection[0]!.to;
    const active = collapsed
      ? state.toolbar.activeMarks.includes(markType)
      : selection.length > 0 && selection.every((range) => fullyMarked(range, markType));
    if (active) this.remove(markType);
    else this.add(markType, undefined, undefined, attrs);
  }
  add(markType: string, from?: number, to?: number, attrs?: Record<string, unknown>): void {
    const mark = { type: markType, attrs: cloneAttributes(attrs ?? {}) };
    for (const range of ranges(this.port.getState(), from, to))
      this.port.append({
        type: "addMark",
        blockId: range.block.id,
        from: range.from,
        to: range.to,
        mark,
      });
  }
  remove(markType: string, from?: number, to?: number): void {
    for (const range of ranges(this.port.getState(), from, to))
      this.port.append({
        type: "removeMark",
        blockId: range.block.id,
        from: range.from,
        to: range.to,
        markType,
      });
  }
  clear(): void {
    const state = this.port.getState();
    for (const range of ranges(state)) {
      const marks =
        range.from === range.to
          ? state.toolbar.activeMarks
          : Array.isArray(range.block.content)
            ? range.block.content.flatMap((span) => span.marks.map((mark) => mark.type))
            : [];
      for (const markType of new Set(marks))
        this.port.append({
          type: "removeMark",
          blockId: range.block.id,
          from: range.from,
          to: range.to,
          markType,
        });
    }
  }
}
