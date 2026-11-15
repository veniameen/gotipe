import type { ChainableCommands } from "../chain";
import { GoTipeError } from "../error";
import type { GoTipeEditor } from "../types/editor";

/**
 * The input rule of a Markdown shortcut that changes its block (D-128): `run` dispatches one
 * transaction. Where the block can't stand — a table cell, a column or toggle that doesn't take
 * it — the transaction is rejected as a whole and changes nothing: the schema refuses the block
 * there (`VALIDATION_ERROR`), or the change leaves no text to take the trigger from
 * (`TRANSFORM_ERROR`, a list in place of a table cell). The rule then gives way (`false`): the
 * typed text stays and no error is reported.
 */
export function givesWay(run: () => boolean | undefined): boolean {
  try {
    return run() !== false;
  } catch (error) {
    const rejected = ["VALIDATION_ERROR", "TRANSFORM_ERROR"];
    if (error instanceof GoTipeError && rejected.includes(error.code)) return false;
    throw error;
  }
}

/**
 * `convert` stages the change of the block with the caret on a chain, and the typed trigger —
 * the first `length` characters of the block — goes in the same transaction: one Undo brings
 * the shortcut back as text. Commands keep the block's ID, so the trigger is there to delete.
 */
export function convertTyped(
  editor: GoTipeEditor,
  length: number,
  convert: (chain: ChainableCommands, blockId: string) => ChainableCommands,
): boolean {
  const blockId = editor.getViewState().selection.anchor.blockId;
  return givesWay(() =>
    convert(editor.chain(), blockId)
      .setSelection({ type: "text", blockId, from: 0, to: length })
      .insertText("")
      .run(),
  );
}
