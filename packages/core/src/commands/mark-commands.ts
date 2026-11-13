import { flattenBlocks } from "../document/tree";
import type { BlockView, ViewState } from "../types/view";
import type { CommandPort } from "./port";

interface TextRange {
  block: BlockView;
  from: number;
  to: number;
}
const holdsText = (block: BlockView) => Array.isArray(block.content);
const length = (block: BlockView) =>
  Array.isArray(block.content) ? block.content.reduce((sum, span) => sum + span.text.length, 0) : 0;

/**
 * Every rich-text block the selection covers, with the covered offsets. Lists, tables and
 * other blocks without their own text are passed over; their rows and cells are included.
 * Explicit `from`/`to` address the block that holds the anchor.
 */
function coveredText(state: ViewState, from?: number, to?: number): TextRange[] {
  const { selection } = state;
  const blocks = flattenBlocks(state.blocks);
  if (from !== undefined || to !== undefined) {
    const block = blocks.find((item) => item.id === selection.anchor.blockId);
    if (!block || !holdsText(block)) return [];
    return [
      {
        block,
        from: from ?? Math.min(selection.anchor.offset, selection.head.offset),
        to: to ?? Math.max(selection.anchor.offset, selection.head.offset),
      },
    ];
  }
  if (selection.type === "block" || selection.type === "multi") {
    const roots = new Set(
      selection.type === "multi" ? (selection.blockIds ?? []) : [selection.anchor.blockId],
    );
    const ranges: TextRange[] = [];
    const visit = (block: BlockView, inside: boolean) => {
      const covered = inside || roots.has(block.id);
      if (covered && holdsText(block)) ranges.push({ block, from: 0, to: length(block) });
      for (const child of block.children) visit(child, covered);
    };
    for (const block of state.blocks) visit(block, false);
    return ranges;
  }
  const a = blocks.findIndex((block) => block.id === selection.anchor.blockId);
  const b = blocks.findIndex((block) => block.id === selection.head.blockId);
  if (a < 0 || b < 0) return [];
  let [start, end] = [selection.anchor, selection.head];
  if (a > b || (a === b && start.offset > end.offset)) [start, end] = [end, start];
  return blocks
    .slice(Math.min(a, b), Math.max(a, b) + 1)
    .filter(holdsText)
    .map((block) => ({
      block,
      from: block.id === start.blockId ? start.offset : 0,
      to: block.id === end.blockId ? end.offset : length(block),
    }));
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

function marksIn(range: TextRange): string[] {
  let position = 0;
  if (!Array.isArray(range.block.content)) return [];
  return range.block.content.flatMap((span) => {
    const start = position;
    position += span.text.length;
    return position <= range.from || start >= range.to ? [] : span.marks.map((mark) => mark.type);
  });
}

/** Mark commands enumerate all selected text blocks without changing selection direction. */
export class MarkCommands {
  constructor(private port: CommandPort) {}

  /**
   * Selected text that may carry `markType` (any text for `null`). Without selected
   * characters the first range is the caret, which edits the stored marks.
   */
  private ranges(markType: string | null, from?: number, to?: number): TextRange[] {
    const ranges = coveredText(this.port.getState(), from, to).filter(
      (range) => markType === null || this.port.schema.acceptsMark(range.block.type, markType),
    );
    const selected = ranges.filter((range) => range.from < range.to);
    return selected.length ? selected : ranges.slice(0, 1);
  }

  /** Removes the mark only when every selected character has it; adds it otherwise. */
  toggle(markType: string, attrs?: Record<string, unknown>): void {
    const state = this.port.getState();
    const ranges = this.ranges(markType);
    const active = ranges.every((range) => range.from === range.to)
      ? state.toolbar.activeMarks.includes(markType)
      : ranges.every((range) => fullyMarked(range, markType));
    if (active) this.remove(markType);
    else this.add(markType, undefined, undefined, attrs);
  }

  /** Text that already has the mark takes the new attributes; omitted ones get their defaults. */
  add(markType: string, from?: number, to?: number, attrs?: Record<string, unknown>): void {
    const mark = { type: markType, attrs: this.port.schema.withDefaults("mark", markType, attrs) };
    for (const { block, from: start, to: end } of this.ranges(markType, from, to)) {
      // A stored mark replaces the others of its exclusive group as the engine does for text.
      if (start === end)
        for (const other of this.port.schema.exclusiveWith(markType))
          this.port.append({
            type: "removeMark",
            blockId: block.id,
            from: start,
            to: end,
            markType: other,
          });
      this.port.append({ type: "addMark", blockId: block.id, from: start, to: end, mark });
    }
  }

  remove(markType: string, from?: number, to?: number): void {
    for (const range of this.ranges(null, from, to))
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
    for (const range of this.ranges(null)) {
      const marks = range.from === range.to ? state.toolbar.activeMarks : marksIn(range);
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
