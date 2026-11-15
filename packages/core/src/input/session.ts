import type { TextSelection } from "../dom/selection";
import { GoTipeError } from "../error";
import type { Document } from "../types/block";
import type { NodeSpec } from "../types/extension";
import type { MarkView, SelectionView, ViewState } from "../types/view";

/**
 * What an input transaction is for the undo history (editor/typing-group.ts): text typed at
 * the caret or over selected text (`insert`), text deleted with Backspace or Delete (`delete`).
 */
export type TypingKind = "insert" | "delete";

/** Mutable input state is owned by the mounted editor; handlers use this narrow port. */
export interface InputHost {
  readonly editable: boolean;
  readonly composing: boolean;
  readonly pendingSelectionRestore: boolean;
  enterMode: "plain" | "shift" | null;
  selection: SelectionView;
  storedMarks: MarkView[] | null;
  handled: boolean;
  readSelectionFromDOM(): TextSelection | null;
  getViewState(): ViewState;
  getDocument(): Document;
  /** What the block type's content holds; `undefined` when the schema does not declare it. */
  content(nodeType: string): NodeSpec["content"] | undefined;
  reportError(error: GoTipeError): void;
  /**
   * `false` when a transaction filter or the engine rejected the change. `typing` lets it
   * continue the undo step of the typing before it.
   */
  dispatch(transaction: object, typing?: TypingKind): boolean;
  liftListItem(): boolean;
  publishSelection(): void;
  scheduleSelectionRestore(): void;
  cancelSelectionRestore(): void;
  runInputRules(blockId: string, caretOffset: number, data: string): void;
}

export function reportInputError(host: InputHost, error: unknown): void {
  host.cancelSelectionRestore();
  host.reportError(
    error instanceof GoTipeError
      ? error
      : new GoTipeError("TRANSFORM_ERROR", error instanceof Error ? error.message : String(error)),
  );
}

/**
 * The selection an input acts on. After the caret restore the DOM's counts: the user may have
 * moved it. A selected block shows in the DOM as a caret at its anchor and head, so only a
 * caret elsewhere takes over from it, as on `keydown` (D-180).
 */
export function resolveSelectionForInput(host: InputHost): SelectionView {
  if (!host.pendingSelectionRestore) {
    const selection = host.readSelectionFromDOM();
    const { type, anchor, head } = host.selection;
    const at = (point: { blockId: string; offset: number }, other: typeof point) =>
      point.blockId === other.blockId && point.offset === other.offset;
    if (
      selection?.anchor.blockId &&
      (type === "text" || !at(selection.anchor, anchor) || !at(selection.head, head))
    )
      host.selection = {
        type: "text",
        anchor: { ...selection.anchor },
        head: { ...selection.head },
      };
  }
  return host.selection;
}
