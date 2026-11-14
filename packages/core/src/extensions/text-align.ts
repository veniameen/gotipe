import { flattenBlocks } from "../document/tree";
import type { GoTipeEditor } from "../types/editor";
import { type Extension, defineExtension } from "../types/extension";
import type { Step } from "../types/state";
import type { BlockView } from "../types/view";

export type TextAlignment = "left" | "center" | "right" | "justify";
export const TEXT_ALIGNMENTS: readonly TextAlignment[] = ["left", "center", "right", "justify"];

export interface TextAlignOptions {
  /** Block types that take the `align` attribute: `Paragraph` and `Heading` declare it. */
  types: string[];
}

/** Blocks of `types` the selection covers: from the anchor to the head, or selected blocks. */
export function selectedBlocks(editor: GoTipeEditor, types: readonly string[]): BlockView[] {
  const { selection, blocks } = editor.getViewState();
  const flat = flattenBlocks(blocks);
  let covered: BlockView[];
  if (selection.type === "text") {
    const a = flat.findIndex((block) => block.id === selection.anchor.blockId);
    const b = flat.findIndex((block) => block.id === selection.head.blockId);
    covered = a < 0 || b < 0 ? [] : flat.slice(Math.min(a, b), Math.max(a, b) + 1);
  } else {
    const roots = new Set(selection.blockIds ?? [selection.anchor.blockId]);
    covered = flat
      .filter((block) => roots.has(block.id))
      .flatMap((block) => flattenBlocks([block]));
  }
  return covered.filter((block) => types.includes(block.type));
}

function align(editor: GoTipeEditor, value: TextAlignment | null, types: readonly string[]) {
  if (!editor.isEditable || (value !== null && !TEXT_ALIGNMENTS.includes(value))) return false;
  const steps: Step[] = selectedBlocks(editor, types)
    .filter((block) => (block.attrs.align ?? null) !== value)
    .map((block) => ({ type: "setBlockAttrs", blockId: block.id, attrs: { align: value } }));
  return steps.length > 0 && editor.dispatch({ steps });
}

const DEFAULT_TYPES = ["paragraph", "heading"];

/**
 * Aligns the selected paragraphs and headings in one undoable step. Returns `false` when
 * nothing changes: no such block is selected, it is already aligned so, or read-only.
 */
export function setTextAlign(
  editor: GoTipeEditor,
  alignment: TextAlignment,
  types: readonly string[] = DEFAULT_TYPES,
): boolean {
  return align(editor, alignment, types);
}

/** Returns the selected blocks to the default alignment (`align: null`). */
export function unsetTextAlign(
  editor: GoTipeEditor,
  types: readonly string[] = DEFAULT_TYPES,
): boolean {
  return align(editor, null, types);
}

/** Alignment of the block that holds the caret, or `null` for the default. */
export function getTextAlign(editor: GoTipeEditor): TextAlignment | null {
  const value = editor.getCurrentBlock()?.attrs.align;
  return TEXT_ALIGNMENTS.includes(value as TextAlignment) ? (value as TextAlignment) : null;
}

function textAlign(options: TextAlignOptions): Extension<TextAlignOptions> {
  // The key is handled whenever such a block is selected, even when nothing changes: the
  // browser's own Mod+Shift+R (reload) or Mod+Shift+J must not run from the editor.
  const shortcut = (key: string, alignment: TextAlignment) => ({
    key,
    command: (editor: GoTipeEditor) => {
      if (!editor.isEditable || !selectedBlocks(editor, options.types).length) return false;
      setTextAlign(editor, alignment, options.types);
      return true;
    },
  });
  const extension = defineExtension<TextAlignOptions>({
    name: "textAlign",
    options,
    keybindings: [
      shortcut("Mod-Shift-l", "left"),
      shortcut("Mod-Shift-e", "center"),
      shortcut("Mod-Shift-r", "right"),
      shortcut("Mod-Shift-j", "justify"),
    ],
  });
  return { ...extension, configure: (next) => textAlign({ ...options, ...next }) };
}

/** Text alignment commands and `Mod+Shift+L/E/R/J` for blocks that declare `align`. */
export const TextAlign = textAlign({ types: DEFAULT_TYPES });
