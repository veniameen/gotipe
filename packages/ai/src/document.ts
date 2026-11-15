import type { Block, GoTipeEditor, SelectionView } from "@gotipe/core";
import type { AiContext } from "./types";

export interface AiTarget {
  /**
   * The blocks the result applies to, as they were when the target was captured: the blocks
   * of the selected text, or the selected blocks. Edits elsewhere — another replica's while
   * the provider works — leave the target valid (D-46).
   */
  readonly document: string;
  readonly selection: SelectionView;
}
export function flatten(blocks: Block[]): Block[] {
  return blocks.flatMap((block) => [block, ...flatten(block.children)]);
}
export function textOf(block: Block): string {
  return typeof block.content === "string"
    ? block.content
    : (block.content ?? []).map((span) => span.text).join("");
}
/** The blocks `selection` covers, in document order; for text, without their children. */
function targetKey(editor: GoTipeEditor, selection: SelectionView): string {
  const all = flatten(editor.getJSON().blocks);
  if (selection.type !== "text") {
    const ids = new Set(selection.blockIds ?? [selection.anchor.blockId]);
    return JSON.stringify(all.filter((block) => ids.has(block.id)));
  }
  const from = all.findIndex((block) => block.id === selection.anchor.blockId);
  const to = all.findIndex((block) => block.id === selection.head.blockId);
  if (from < 0 || to < 0) return "";
  const covered = all.slice(Math.min(from, to), Math.max(from, to) + 1);
  return JSON.stringify(covered.map(({ children: _, ...block }) => block));
}
/** Each block as JSON by ID: what a request about the whole document was asked about. */
export function blockSnapshots(editor: GoTipeEditor): Map<string, string> {
  return new Map(
    flatten(editor.getJSON().blocks).map((block) => [block.id, JSON.stringify(block)]),
  );
}
export function captureTarget(editor: GoTipeEditor): AiTarget {
  const selection = structuredClone(editor.getViewState().selection);
  return { document: targetKey(editor, selection), selection };
}
export function assertWritable(editor: GoTipeEditor): void {
  if (editor.isDestroyed) throw new Error("The editor has been destroyed");
  if (!editor.isEditable) throw new Error("AI cannot change a read-only document");
}
export function assertTarget(editor: GoTipeEditor, target: AiTarget): void {
  assertWritable(editor);
  if (targetKey(editor, target.selection) !== target.document) {
    throw new Error("The document changed while AI was working. Run the command again.");
  }
}
export function selectedText(blocks: Block[], selection: SelectionView): string | undefined {
  const all = flatten(blocks);
  if (selection.type !== "text") {
    const ids = new Set(selection.blockIds ?? [selection.anchor.blockId]);
    const collect = (items: Block[], ancestorSelected = false): string[] =>
      items.flatMap((block) => {
        const included = ancestorSelected || ids.has(block.id);
        return [...(included ? [textOf(block)] : []), ...collect(block.children, included)];
      });
    return collect(blocks).join("\n") || undefined;
  }
  let from = all.findIndex((block) => block.id === selection.anchor.blockId);
  let to = all.findIndex((block) => block.id === selection.head.blockId);
  if (from < 0 || to < 0) return undefined;
  let start = selection.anchor.offset;
  let end = selection.head.offset;
  if (from > to || (from === to && start > end)) {
    [from, to] = [to, from];
    [start, end] = [end, start];
  }
  return (
    all
      .slice(from, to + 1)
      .map((block, index) => {
        const text = textOf(block);
        return text.slice(index === 0 ? start : 0, index === to - from ? end : undefined);
      })
      .join("\n") || undefined
  );
}
export function buildAiContext(
  editor: GoTipeEditor,
  maxContextBlocks = 5,
  full = false,
): AiContext {
  const blocks = editor.getJSON().blocks;
  const all = flatten(blocks);
  const selection = editor.getViewState().selection;
  const index = all.findIndex((block) => block.id === selection.anchor.blockId);
  const count = Math.max(0, Math.min(100, Math.floor(maxContextBlocks)));
  return {
    selectedText: selectedText(blocks, selection),
    currentBlock: all[index],
    surroundingBlocks: full ? all : all.slice(Math.max(0, index - count), index + count + 1),
    ...(full ? { fullText: all.map(textOf).join("\n") } : {}),
  };
}
export function blockLocation(
  blocks: Block[],
  id: string,
  parentId: string | null = null,
): { block: Block; parentId: string | null; index: number } | null {
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]!;
    if (block.id === id) return { block, parentId, index };
    const child = blockLocation(block.children, id, block.id);
    if (child) return child;
  }
  return null;
}
export function validOffset(text: string, offset: number): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return false;
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}
