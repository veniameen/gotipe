import {
  engineToViewSelection,
  validateSelection,
  viewToEngineSelection,
} from "../document/selection";
import { getMarksAt, mapSelectionToDocument } from "../document/tree";
import { fromWasmDoc, toWasmTransaction } from "../engine/conversion";
import { GoTipeError } from "../error";
import type { TypingKind } from "../input/session";
import type { Selection, Transaction, TransactionContext } from "../types/state";
import type { MarkView, SelectionView, ViewState } from "../types/view";
import type { WasmBridge } from "../wasm-bridge";
import { createTypingGroup } from "./typing-group";

interface TransactionPort {
  collaboration: Pick<
    WasmBridge,
    | "isCollaborating"
    | "canUndoCollaboration"
    | "canRedoCollaboration"
    | "undoCollaboration"
    | "redoCollaboration"
    | "clearCollaborationHistory"
    | "getSelection"
    | "setSelection"
  >;
  readonly destroyed: boolean;
  selection: SelectionView;
  storedMarks: MarkView[] | null;
  getDocumentJSON(): string;
  apply(transaction: string): string;
  preview(transaction: string): string;
  restoreDocument(state: string): void;
  getViewState(): ViewState;
  invalidate(): void;
  publishUpdate(): void;
  publishSelection(): void;
  publishView(): void;
  scheduleSelectionRestore(): void;
  restoreSelectionNow(): void;
  shouldInspectTransaction(): boolean;
  filterTransaction(context: TransactionContext): boolean;
  publishTransaction(context: TransactionContext): void;
  beforeMutation(reason: string): void;
}

/**
 * The native history of collaboration joins only typing that the editor marks as going on
 * with the open typing step (`metadata.typing`, `continues_typing` in gotipe-wasm), so the
 * same typing group decides the undo steps with and without collaboration. A host's own
 * `metadata.typing` is not passed on: its `dispatch` stays a step of its own.
 */
const withNativeTyping = (transaction: Record<string, unknown>, typing?: TypingKind) =>
  JSON.stringify({ ...transaction, metadata: { ...(transaction.metadata as object), typing } });

/**
 * Owns transaction acceptance and document/selection undo boundaries. `dispatch(tr, kind)`:
 * `kind` is typing from the input layer, which may go on with the open undo step.
 */
export function createTransactions(port: TransactionPort) {
  const MAX_HISTORY = 100;
  type HistoryEntry = { state: string; selection: ViewState["selection"] };
  const undoStack: HistoryEntry[] = [];
  const redoStack: HistoryEntry[] = [];
  const typing = createTypingGroup();
  const captureHistory = (state = port.getDocumentJSON()): HistoryEntry => ({
    state,
    selection: {
      ...port.selection,
      type: port.selection.type,
      anchor: { ...port.selection.anchor },
      head: { ...port.selection.head },
    },
  });
  const restoreHistory = (entry: HistoryEntry) => {
    port.restoreDocument(entry.state);
    const blocks = fromWasmDoc(JSON.parse(entry.state)).blocks as ViewState["blocks"];
    port.selection = mapSelectionToDocument(entry.selection, blocks, blocks) ?? {
      type: "text",
      anchor: { blockId: "", offset: 0 },
      head: { blockId: "", offset: 0 },
    };
    port.storedMarks = null;
    port.invalidate();
  };
  const nativeUndo = (redo: boolean): boolean => {
    if (redo ? !port.collaboration.canRedoCollaboration : !port.collaboration.canUndoCollaboration)
      return false;
    port.beforeMutation(redo ? "redo" : "undo");
    const state = redo
      ? port.collaboration.redoCollaboration()
      : port.collaboration.undoCollaboration();
    if (state === null) return false;
    const blocks = fromWasmDoc(JSON.parse(state)).blocks as ViewState["blocks"];
    port.selection = blocks.length
      ? engineToViewSelection(port.collaboration.getSelection(), state)
      : { type: "text", anchor: { blockId: "", offset: 0 }, head: { blockId: "", offset: 0 } };
    port.storedMarks = null;
    port.invalidate();
    port.publishUpdate();
    port.publishSelection();
    port.publishView();
    if (port.selection.anchor.blockId) port.scheduleSelectionRestore();
    return true;
  };

  return {
    preview(transaction: object) {
      return fromWasmDoc(
        JSON.parse(
          port.preview(JSON.stringify(toWasmTransaction(transaction as Record<string, unknown>))),
        ),
      );
    },
    dispatch(transaction: object, kind?: TypingKind): boolean {
      if (port.destroyed) return false;

      const tr = transaction as {
        steps: Record<string, unknown>[];
        selection?: Selection;
        metadata?: Record<string, unknown>;
      };
      const steps = tr.steps ?? [];
      if (steps.length === 0 && !tr.selection) return true;
      const wasmTr = toWasmTransaction(transaction as Record<string, unknown>);
      const serializedTransaction = JSON.stringify(wasmTr);
      const beforeJson = port.getDocumentJSON();
      const candidate = port.preview(serializedTransaction);
      const explicitSelection = tr.selection ? validateSelection(tr.selection, candidate!) : null;
      const context: TransactionContext | null =
        candidate && port.shouldInspectTransaction()
          ? {
              transaction: structuredClone(transaction as Transaction),
              before: fromWasmDoc(JSON.parse(beforeJson)),
              after: fromWasmDoc(JSON.parse(candidate)),
            }
          : null;
      if (context && !port.filterTransaction(context)) {
        port.scheduleSelectionRestore();
        return false;
      }
      if (steps.length === 0 && explicitSelection) {
        port.selection = explicitSelection;
        port.storedMarks = null;
        port.invalidate();
        if (context) port.publishTransaction(context);
        port.publishSelection();
        port.publishView();
        port.restoreSelectionNow();
        port.scheduleSelectionRestore();
        return true;
      }

      // Detect stored marks toggle: all steps are addMark/removeMark with from === to
      const isStoredMarkToggle =
        steps.length > 0 &&
        steps.every((step) => {
          const type = step.type as string;
          return (type === "addMark" || type === "removeMark") && step.from === step.to;
        });

      if (isStoredMarkToggle) {
        typing.close();
        if (explicitSelection) port.selection = explicitSelection;
        // Handle as stored marks toggle — no WASM dispatch needed
        const state = port.getViewState();
        for (const step of steps) {
          const type = step.type as string;
          if (type === "addMark") {
            const mark = step.mark as { type: string; attrs?: Record<string, unknown> };
            const currentMarks =
              port.storedMarks ??
              getMarksAt(state.blocks, port.selection.anchor.blockId, port.selection.anchor.offset);
            port.storedMarks = [
              ...currentMarks.filter((m) => m.type !== mark.type),
              { type: mark.type, attrs: mark.attrs ?? {} },
            ];
          } else if (type === "removeMark") {
            const markType = step.markType as string;
            const currentMarks =
              port.storedMarks ??
              getMarksAt(state.blocks, port.selection.anchor.blockId, port.selection.anchor.offset);
            port.storedMarks = currentMarks.filter((m) => m.type !== markType);
          }
        }
        port.invalidate();
        if (context) port.publishTransaction(context);
        port.publishUpdate();
        port.publishView();
        if (port.selection.anchor.blockId) {
          port.scheduleSelectionRestore();
        }
        return true;
      }

      try {
        if (candidate !== beforeJson) port.beforeMutation("dispatch");
        // Snapshot current state for undo before applying. `metadata.addToHistory: false`
        // (also read by the native history) commits without an undo step and leaves the
        // typing step open; typing that goes on with it needs no snapshot of its own.
        const recorded = tr.metadata?.addToHistory !== false;
        const local = recorded && !port.collaboration.isCollaborating;
        const continues = typing.continues(kind, port.selection);
        const snapshot = local && !continues ? captureHistory() : null;
        if (port.collaboration.isCollaborating && port.selection.anchor.blockId)
          port.collaboration.setSelection(JSON.stringify(viewToEngineSelection(port.selection)));
        const before = port.getViewState().blocks;
        const previousSelection = port.selection;
        const afterJson = port.apply(
          port.collaboration.isCollaborating
            ? withNativeTyping(wasmTr, continues ? kind : undefined)
            : serializedTransaction,
        );
        if (explicitSelection) {
          port.selection = explicitSelection;
          port.storedMarks = null;
        } else {
          const after = fromWasmDoc(JSON.parse(afterJson)).blocks as ViewState["blocks"];
          port.selection = mapSelectionToDocument(port.selection, before, after) ?? {
            type: "text",
            anchor: { blockId: "", offset: 0 },
            head: { blockId: "", offset: 0 },
          };
        }

        if (snapshot) undoStack.push(snapshot);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        if (recorded) redoStack.length = 0; // new mutation clears redo
        if (recorded) typing.record(kind, port.selection);

        port.invalidate();
        if (context)
          port.publishTransaction({ ...context, after: fromWasmDoc(JSON.parse(afterJson)) });
        if (
          explicitSelection ||
          JSON.stringify(previousSelection) !== JSON.stringify(port.selection)
        )
          port.publishSelection();
        port.publishUpdate();
        port.publishView();
        if (port.selection.anchor.blockId) {
          port.scheduleSelectionRestore();
        }
      } catch (e) {
        throw new GoTipeError(
          "TRANSFORM_ERROR",
          e instanceof Error ? e.message : "Transaction failed",
        );
      }
      return true;
    },

    undo(): boolean {
      typing.close();
      if (port.collaboration.isCollaborating) return nativeUndo(false);
      if (undoStack.length === 0) return false;
      port.beforeMutation("undo");
      const prev = undoStack.pop()!;
      redoStack.push(captureHistory());
      restoreHistory(prev);
      port.publishUpdate();
      port.publishSelection();
      port.publishView();
      if (port.selection.anchor.blockId) {
        port.scheduleSelectionRestore();
      }
      return true;
    },

    redo(): boolean {
      typing.close();
      if (port.collaboration.isCollaborating) return nativeUndo(true);
      if (redoStack.length === 0) return false;
      port.beforeMutation("redo");
      const next = redoStack.pop()!;
      undoStack.push(captureHistory());
      restoreHistory(next);
      port.publishUpdate();
      port.publishSelection();
      port.publishView();
      if (port.selection.anchor.blockId) {
        port.scheduleSelectionRestore();
      }
      return true;
    },

    get canUndo() {
      return port.collaboration.isCollaborating
        ? port.collaboration.canUndoCollaboration
        : undoStack.length > 0;
    },
    get canRedo() {
      return port.collaboration.isCollaborating
        ? port.collaboration.canRedoCollaboration
        : redoStack.length > 0;
    },
    resetHistory(previous?: HistoryEntry) {
      typing.close();
      if (port.collaboration.isCollaborating) {
        undoStack.length = 0;
        redoStack.length = 0;
        if (!previous) port.collaboration.clearCollaborationHistory();
        return;
      }
      if (previous) {
        undoStack.push({ state: previous.state, selection: structuredClone(previous.selection) });
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
      } else undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
