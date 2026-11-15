import type {
  BlockView,
  GoTipeEditor,
  MarkView,
  Selection,
  SelectionView,
  ViewState,
} from "@gotipe/core";

export function blockPath(blocks: BlockView[], id: string): BlockView[] {
  for (const block of blocks) {
    if (block.id === id) return [block];
    const children = blockPath(block.children, id);
    if (children.length) return [block, ...children];
  }
  return [];
}
export function currentMarks(editor: GoTipeEditor): MarkView[] {
  return marksAt(editor.getViewState());
}
/** The marks of the text at the selection's anchor, read from a view state. */
export function marksAt(state: ViewState): MarkView[] {
  const block = blockPath(state.blocks, state.selection.anchor.blockId).at(-1);
  if (!block || !Array.isArray(block.content)) return [];
  const offset = state.selection.anchor.offset;
  const length = block.content.reduce((sum, span) => sum + span.text.length, 0);
  let position = 0;
  for (const span of block.content) {
    const start = position;
    position += span.text.length;
    if (offset >= start && (offset < position || position === length)) return span.marks;
  }
  return [];
}
export function capturedSelection(selection: SelectionView): Selection {
  if (selection.type === "block") return { type: "block", blockId: selection.anchor.blockId };
  if (selection.type === "multi")
    return { type: "multi", blockIds: selection.blockIds ?? [selection.anchor.blockId] };
  return { type: "range", anchor: { ...selection.anchor }, head: { ...selection.head } };
}
