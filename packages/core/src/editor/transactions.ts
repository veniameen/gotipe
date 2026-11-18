import {
  engineToViewSelection,
  validateSelection,
  viewToEngineSelection,
} from "../document/selection";
import { getMarksAt, mapSelectionToDocument } from "../document/tree";
import { fromWasmDoc, toWasmTransaction } from "../engine/conversion";
import type { FallbackDoc } from "../engine/types";
import { GoTipeError } from "../error";
import type { TypingKind } from "../input/session";
import type { Document } from "../types/block";
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
  /** The parsed state of `json`, shared: it must not be changed. */
  parseState(json: string): FallbackDoc;
  /** The public document of the state `json`; its blocks are shared and must not be changed. */
  decodeState(json: string): Document;
  apply(transaction: string): string;
  preview(transaction: string): string;
  restoreDocument(state: string): void;
  getViewState(): ViewState;
  invalidate(): void;
  publishUpdate(origin: "local" | "remote"): void;
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
 * The context of a transaction for filters and listeners. `before` and `after` are detached
 * documents, decoded when first read: most listeners read only the transaction.
 */
export function transactionContext<Extra extends object>(
  transaction: Transaction,
  before: () => Document,
  after: () => Document,
  extra?: Extra,
): TransactionContext & Extra {
  const lazy = (read: () => Document): PropertyDescriptor => {
    let value: Document | undefined;
    return {
      enumerable: true,
      get: () => {
        value ??= read();
        return value;
      },
    };
  };
  return Object.defineProperties({ ...extra, transaction } as TransactionContext & Extra, {
    before: lazy(before),
    after: lazy(after),
  });
}

/**
 * Owns transaction acceptance and document/selection undo boundaries. `dispatch(tr, kind,
 * since)`: `kind` is typing from the input layer, which may go on with the open undo step;
 * `since` is when it began (a composition: at `compositionstart`).
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
    const blocks = port.decodeState(entry.state).blocks as ViewState["blocks"];
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
    const blocks = port.decodeState(state).blocks as ViewState["blocks"];
    port.selection = blocks.length
      ? engineToViewSelection(port.collaboration.getSelection(), state)
      : { type: "text", anchor: { blockId: "", offset: 0 }, head: { blockId: "", offset: 0 } };
    port.storedMarks = null;
    port.invalidate();
    port.publishUpdate("local");
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
    dispatch(transaction: object, kind?: TypingKind, since?: number): boolean {
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
      const explicitSelection = tr.selection
        ? validateSelection(tr.selection, port.parseState(candidate!))
        : null;
      const context: TransactionContext | null =
        candidate && port.shouldInspectTransaction()
          ? transactionContext(
              structuredClone(transaction as Transaction),
              () => fromWasmDoc(port.parseState(beforeJson)),
              () => fromWasmDoc(port.parseState(candidate)),
            )
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
        port.publishUpdate("local");
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
        const continues = typing.continues(kind, port.selection, since);
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
          const after = port.decodeState(afterJson).blocks as ViewState["blocks"];
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
          port.publishTransaction(
            transactionContext(
              context.transaction,
              () => context.before,
              () => fromWasmDoc(port.parseState(afterJson)),
            ),
          );
        if (
          explicitSelection ||
          JSON.stringify(previousSelection) !== JSON.stringify(port.selection)
        )
          port.publishSelection();
        // A repair after another replica's edit (`origin: "repair"`) is that edit's.
        port.publishUpdate(tr.metadata?.origin === "repair" ? "remote" : "local");
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
      port.publishUpdate("local");
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
      port.publishUpdate("local");
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
