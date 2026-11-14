import {
  type TextDirection as Direction,
  TEXT_DIRECTIONS,
  isTextDirection,
} from "../document/text-style";
import type { GoTipeEditor } from "../types/editor";
import { type Extension, defineExtension } from "../types/extension";
import type { Step } from "../types/state";
import { selectedBlocks } from "./text-align";

export { TEXT_DIRECTIONS };
/** Base direction of a block: `auto` takes it from the first strong character. */
export type TextDirection = Direction;

export interface TextDirectionOptions {
  /** Block types that take the `dir` attribute: paragraphs, headings, list and to-do items. */
  types: string[];
}

const DEFAULT_TYPES = ["paragraph", "heading", "listItem", "todoItem"];

function direct(editor: GoTipeEditor, value: TextDirection | null, types: readonly string[]) {
  if (!editor.isEditable || (value !== null && !isTextDirection(value))) return false;
  const steps: Step[] = selectedBlocks(editor, types)
    .filter((block) => (block.attrs.dir ?? null) !== value)
    .map((block) => ({ type: "setBlockAttrs", blockId: block.id, attrs: { dir: value } }));
  return steps.length > 0 && editor.dispatch({ steps });
}

/**
 * Sets the base direction of the selected blocks in one undoable step. Returns `false` when
 * nothing changes: no such block is selected, it already has that direction, or read-only.
 * Offsets stay logical (UTF-16 in storage order) whatever the direction.
 */
export function setTextDirection(
  editor: GoTipeEditor,
  dir: TextDirection,
  types: readonly string[] = DEFAULT_TYPES,
): boolean {
  return direct(editor, dir, types);
}

/** Returns the selected blocks to the inherited direction (`dir: null`). */
export function unsetTextDirection(
  editor: GoTipeEditor,
  types: readonly string[] = DEFAULT_TYPES,
): boolean {
  return direct(editor, null, types);
}

/** Direction of the block that holds the caret, or `null` when it inherits it. */
export function getTextDirection(editor: GoTipeEditor): TextDirection | null {
  const value = editor.getCurrentBlock()?.attrs.dir;
  return isTextDirection(value) ? value : null;
}

function textDirection(options: TextDirectionOptions): Extension<TextDirectionOptions> {
  const extension = defineExtension<TextDirectionOptions>({ name: "textDirection", options });
  return { ...extension, configure: (next) => textDirection({ ...options, ...next }) };
}

/** Direction commands for blocks that declare `dir` (`ltr`, `rtl` or `auto`). */
export const TextDirection = textDirection({ types: DEFAULT_TYPES });
