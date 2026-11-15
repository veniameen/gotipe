import type { ClipboardHandler } from "../clipboard/handler";
import { findBlockInTree, findParentBlock, getMarksAt, isBlockEmpty } from "../document/tree";
import { ownsInputTarget } from "../dom/input-owner";
import { installDOMSelection } from "../dom/selection";
import type { GoTipeError } from "../error";
import { installBeforeInput } from "../input/before-input";
import { installComposition } from "../input/composition";
import { replaceStructuredSelection } from "../input/selection-edit";
import { type InputHost, type TypingKind, reportInputError } from "../input/session";
import type { Document } from "../types/block";
import type { MarkView, SelectionView, ViewState } from "../types/view";

export interface MountPort {
  readonly editable: boolean;
  selection: SelectionView;
  storedMarks: MarkView[] | null;
  clipboard: Pick<ClipboardHandler, "onPaste" | "onCopy" | "onCut" | "onDrop">;
  getViewState(): ViewState;
  getDocument(): Document;
  /**
   * `typing`: the input goes on with the undo step of the typing before it; `since`: when it
   * began (a composition: at `compositionstart`).
   */
  dispatch(transaction: object, typing?: TypingKind, since?: number): boolean;
  liftListItem(): boolean;
  publishSelection(): void;
  redrawBlocks(ids: string[]): void;
  openLink(href: string, options: { blockId: string | null; newTab: boolean }): void;
  reportError(error: GoTipeError): void;
  notifyFocus(focused: boolean): void;
  openSlashMenu(): void;
  applyInputRules(text: string): boolean;
  handleKeybinding(event: KeyboardEvent, target: HTMLElement): boolean;
}

/** Connects one DOM surface to model/input ports; AbortSignal owns every listener. */
export function mountSurface(
  element: HTMLElement,
  signal: AbortSignal,
  port: MountPort,
  autofocus: boolean,
) {
  element.setAttribute("contenteditable", port.editable ? "true" : "false");
  element.setAttribute("role", "textbox");
  element.setAttribute("aria-multiline", "true");
  element.setAttribute("data-gotipe-editor", "");

  element.setAttribute("aria-readonly", port.editable ? "false" : "true");
  element.addEventListener(
    "paste",
    (e) => {
      if (!ownsInputTarget(element, e.target)) return;
      if (!port.editable) {
        e.preventDefault();
        return;
      }
      // Until a pending restore puts the native caret where the model's is, the model's
      // counts, as for typing (D-136).
      port.clipboard.onPaste(e, domSelection.pending);
    },
    { signal },
  );
  element.addEventListener(
    "copy",
    (e) => {
      if (ownsInputTarget(element, e.target)) port.clipboard.onCopy(e);
    },
    { signal },
  );
  element.addEventListener(
    "cut",
    (e) => {
      if (!ownsInputTarget(element, e.target)) return;
      if (!port.editable) {
        e.preventDefault();
        return;
      }
      port.clipboard.onCut(e);
    },
    { signal },
  );
  element.addEventListener(
    "drop",
    (e) => {
      if (!ownsInputTarget(element, e.target)) return;
      if (!port.editable) e.preventDefault();
      else port.clipboard.onDrop(e);
    },
    { signal },
  );

  // Links never navigate the page: plain click places the caret while
  // editing; Cmd/Ctrl+click (or any click when read-only) goes through
  // host.openLink.
  const onLinkActivate = (e: MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const anchor = target?.closest("a[href]");
    if (!anchor || !element.contains(anchor)) return;
    e.preventDefault();
    const wantsOpen = !port.editable || e.metaKey || e.ctrlKey || e.button === 1;
    if (!wantsOpen) return;
    const blockId = anchor.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null;
    port.openLink(anchor.getAttribute("href") ?? "", { blockId, newTab: true });
  };
  element.addEventListener("click", onLinkActivate, { signal });
  element.addEventListener("auxclick", onLinkActivate, { signal });
  element.addEventListener("focus", () => port.notifyFocus(true), { signal });
  element.addEventListener("blur", () => port.notifyFocus(false), { signal });

  const publishSelection = port.publishSelection;
  const domSelection = installDOMSelection(element, signal, {
    getSelection: () => port.selection,
    updateSelection: (selection) => {
      port.selection = {
        type: "text",
        anchor: { ...selection.anchor },
        head: { ...selection.head },
      };
      port.storedMarks = null;
      publishSelection();
    },
    getBlocks: () => port.getViewState().blocks,
    redrawBlocks: port.redrawBlocks,
    isComposing: () => composition.blockId !== null,
    consumeHandledInput: () => {
      const handled = inputHandledByWasm;
      inputHandledByWasm = false;
      return handled;
    },
  });
  const readSelectionFromDOM = domSelection.read;
  const restoreDomSelection = domSelection.restore;
  const scheduleSelectionRestore = domSelection.schedule;
  const cancelSelectionRestore = domSelection.cancel;

  // --- Native input leak protection ---
  // Some environments (headless browsers, certain IME) ignore
  // beforeinput.preventDefault(). Track whether we handled the input
  // via WASM so we can correct the DOM in the `input` event if the
  // native mutation leaked through.
  let inputHandledByWasm = false;
  let pendingEnterMode: "plain" | "shift" | null = null;
  let composedSince = 0;
  const composition = installComposition(element, signal, {
    isEditable: () => port.editable,
    prepareSelection: () => {
      composedSince = Date.now();
      if (domSelection.pending) restoreDomSelection();
      const dom = domSelection.pending ? null : readSelectionFromDOM?.();
      // Composition starts where the model caret is: never inside an inline atom.
      if (dom?.anchor.blockId) port.selection = { type: "text", ...dom };
      return port.selection;
    },
    getBlock: (id) => findBlockInTree(port.getViewState().blocks, id),
    getDocument: () => port.getDocument(),
    restoreSelection: scheduleSelectionRestore,
    getMarks: (id, offset) =>
      port.storedMarks ?? getMarksAt(port.getViewState().blocks, id, offset),
    commit: (steps, caret) => {
      inputHandledByWasm = true;
      // A composition goes on with the typing step from its start (D-131).
      port.dispatch({ steps, selection: { type: "cursor", ...caret } }, "insert", composedSince);
      port.storedMarks = null;
      scheduleSelectionRestore();
    },
    reportError: (error) => {
      cancelSelectionRestore();
      port.reportError(error);
    },
  });

  const runInputRules = (blockId: string, caretOffset: number, data: string) => {
    const ruleState = port.getViewState();
    const ruleBlock = findBlockInTree(ruleState.blocks, blockId);
    if (!ruleBlock || !Array.isArray(ruleBlock.content)) return;
    const ruleText = ruleBlock.content.map((s: { text: string }) => s.text).join("");
    if (port.applyInputRules(ruleText)) return;

    // Slash menu trigger should also work at caret in non-empty blocks
    // (e.g. typing "/" at the start of an existing line).
    if (data === "/") {
      const safeOffset = Math.max(0, Math.min(caretOffset, ruleText.length));
      const beforeCaret = ruleText.slice(0, safeOffset);
      const slashIdx = beforeCaret.lastIndexOf("/");
      if (slashIdx !== -1) {
        const prevChar = slashIdx > 0 ? (beforeCaret[slashIdx - 1] ?? "") : "";
        const query = beforeCaret.slice(slashIdx + 1);
        if ((slashIdx === 0 || /\s/.test(prevChar)) && !/\s/.test(query)) {
          port.openSlashMenu();
        }
      }
    }
  };

  const input: InputHost = {
    get editable() {
      return port.editable;
    },
    get composing() {
      return composition.blockId !== null;
    },
    get pendingSelectionRestore() {
      return domSelection.pending;
    },
    get enterMode() {
      return pendingEnterMode;
    },
    set enterMode(value) {
      pendingEnterMode = value;
    },
    get selection() {
      return port.selection;
    },
    set selection(value) {
      port.selection = value;
    },
    get storedMarks() {
      return port.storedMarks;
    },
    set storedMarks(value) {
      port.storedMarks = value;
    },
    get handled() {
      return inputHandledByWasm;
    },
    set handled(value) {
      inputHandledByWasm = value;
    },
    readSelectionFromDOM: () => readSelectionFromDOM?.() ?? null,
    getViewState: () => port.getViewState(),
    getDocument: () => port.getDocument(),
    reportError: (error) => port.reportError(error),
    dispatch: (transaction, typing) => port.dispatch(transaction, typing),
    liftListItem: () => port.liftListItem(),
    publishSelection,
    scheduleSelectionRestore,
    cancelSelectionRestore,
    runInputRules,
  };
  installBeforeInput(element, signal, input);

  // Keyboard shortcuts from extensions
  element.addEventListener(
    "keydown",
    (e) => {
      if (!ownsInputTarget(element, e.target)) return;
      if (e.isComposing || composition.blockId !== null || e.keyCode === 229) return;
      const navigatesSelection =
        /^(?:Arrow(?:Left|Right|Up|Down)|Home|End|PageUp|PageDown)$/.test(e.key) ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a");
      if (navigatesSelection) {
        if (domSelection.pending) restoreDomSelection();
        cancelSelectionRestore();
      }
      // selectionchange can arrive after the first shortcut following a click.
      // A pending model edit still owns its next caret restore.
      if (!domSelection.pending) {
        const selection = readSelectionFromDOM();
        if (
          selection &&
          JSON.stringify(selection) !==
            JSON.stringify({ anchor: port.selection.anchor, head: port.selection.head })
        ) {
          port.selection = {
            type: "text",
            anchor: { ...selection.anchor },
            head: { ...selection.head },
          };
          port.storedMarks = null;
          publishSelection();
        }
      }
      if (!port.editable) {
        // Read-only: allow navigation and copy, block editing shortcuts.
        return;
      }
      if (e.key === "Enter") {
        pendingEnterMode = e.shiftKey ? "shift" : "plain";
      }

      const isPasteShortcut =
        (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "v";
      if (isPasteShortcut) {
        const selection = document.getSelection();
        const selectionAnchor = selection?.anchorNode ?? null;
        const eventTarget = e.target instanceof Node ? e.target : null;
        const inEditor =
          (selectionAnchor ? element.contains(selectionAnchor) : false) ||
          (eventTarget ? element.contains(eventTarget) : false);
        if (inEditor && !domSelection.pending) {
          const dom = readSelectionFromDOM?.();
          if (dom?.anchor.blockId) {
            port.selection = { type: "text", anchor: { ...dom.anchor }, head: { ...dom.head } };
          }
        }
      }

      const plainKey = !e.metaKey && !e.ctrlKey && !e.altKey;
      // A selected block goes as a whole, a list item too. Its anchor and head are its
      // start, which `beforeinput` would read back from the DOM as a caret there (D-135).
      if (
        (e.key === "Backspace" || e.key === "Delete") &&
        plainKey &&
        port.selection.type !== "text"
      ) {
        e.preventDefault();
        try {
          replaceStructuredSelection(input, port.selection, "delete");
          scheduleSelectionRestore();
        } catch (error) {
          reportInputError(input, error);
        }
        return;
      }

      // Some browsers do not dispatch beforeinput(deleteContentBackward)
      // at list-item boundaries. Handle this path on keydown. Until a pending
      // restore puts the native caret where the model's is, the model's counts,
      // as for `beforeinput` (input/session.ts).
      if (e.key === "Backspace" && plainKey) {
        const caret = domSelection.pending ? port.selection : readSelectionFromDOM();
        if (
          caret &&
          caret.anchor.blockId === caret.head.blockId &&
          caret.anchor.offset === caret.head.offset &&
          caret.anchor.offset === 0
        ) {
          const state = port.getViewState();
          const currentBlock = findBlockInTree(state.blocks, caret.anchor.blockId);
          const parentInfo = currentBlock
            ? findParentBlock(state.blocks, caret.anchor.blockId)
            : null;
          const insideListItem =
            !!currentBlock &&
            (currentBlock.type === "listItem" || currentBlock.type === "todoItem") &&
            !!parentInfo &&
            (parentInfo.parent.type === "bulletList" ||
              parentInfo.parent.type === "orderedList" ||
              parentInfo.parent.type === "todoList");
          if (insideListItem && !isBlockEmpty(currentBlock)) {
            e.preventDefault();
            try {
              inputHandledByWasm = true;
              const converted = port.liftListItem();
              if (converted) {
                const nextSelection = port.getViewState().selection;
                port.selection = {
                  type: "text",
                  anchor: {
                    blockId: nextSelection.anchor.blockId,
                    offset: nextSelection.anchor.offset,
                  },
                  head: {
                    blockId: nextSelection.head.blockId,
                    offset: nextSelection.head.offset,
                  },
                };
                publishSelection();
                scheduleSelectionRestore();
                return;
              }
            } catch {
              // Fall through to regular key processing.
            }
            cancelSelectionRestore();
          }
        }
      }

      const selection = document.getSelection();
      const selectionTarget =
        selection?.anchorNode instanceof HTMLElement
          ? selection.anchorNode
          : (selection?.anchorNode?.parentElement ?? null);
      const whenTarget =
        (selectionTarget && element.contains(selectionTarget) ? selectionTarget : null) ??
        (e.target instanceof HTMLElement ? e.target : element);

      if (port.handleKeybinding(e, whenTarget)) e.preventDefault();
    },
    { signal },
  );

  // Input rules from extensions
  element.addEventListener(
    "input",
    (e) => {
      if (!ownsInputTarget(element, e.target)) return;
      if (composition.blockId !== null) return;
      // Skip input rules if WASM already handled this — DOM correction
      // happens in the rAF callback of scheduleSelectionRestore()
      if (inputHandledByWasm) return;

      const state = port.getViewState();
      const block = state.blocks.find((b) => b.id === state.selection.anchor.blockId);
      if (!block || !Array.isArray(block.content)) return;
      const text = block.content.map((s) => s.text).join("");

      port.applyInputRules(text);
    },
    { signal },
  );

  if (autofocus) {
    element.focus();
  }
  return {
    ...domSelection,
    interrupt: composition.interrupt,
    deferPresentation: composition.deferPresentation,
    get composing() {
      return composition.blockId !== null;
    },
  };
}
