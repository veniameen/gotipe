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

export function resolveSelectionForInput(host: InputHost): SelectionView {
  if (!host.pendingSelectionRestore) {
    const selection = host.readSelectionFromDOM();
    if (selection?.anchor.blockId)
      host.selection = {
        type: "text",
        anchor: { ...selection.anchor },
        head: { ...selection.head },
      };
  }
  return host.selection;
}
