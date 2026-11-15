import { ChainableCommands } from "./chain";
import { ClipboardHandler } from "./clipboard/handler";
import { commandSchema } from "./commands/schema";
import { viewToEngineSelection } from "./document/selection";
import {
  blockTextLength,
  findBlockInTree,
  findFirstSelectableBlock,
  mapSelectionToDocument,
} from "./document/tree";
import { createAtomSelection } from "./editor/atom-selection";
import { clipboardOptions } from "./editor/clipboard-options";
import { createCollaboration } from "./editor/collaboration";
import { createExtensionEvents, startCollaboration } from "./editor/extension-events";
import { createExtensionLifecycle } from "./editor/extension-lifecycle";
import { createHostActions } from "./editor/host";
import { initializeEditor } from "./editor/initialize";
import { mountSurface } from "./editor/mount";
import { createTransactionFilters } from "./editor/transaction-filters";
import { createTransactions } from "./editor/transactions";
import { createViewState } from "./editor/view-state";
import { fromWasmDoc, toWasmDoc } from "./engine/conversion";
import { GoTipeError } from "./error";
import { parseHtmlDocument } from "./html";
import { blocksToText } from "./text";
import type { Document } from "./types/block";
import type {
  CreateEditorOptions,
  EditorHost,
  GoTipeEditor,
  SetContentOptions,
} from "./types/editor";
import type { EditorEvents } from "./types/events";
import type { SlashCommandDef } from "./types/extension";
export type {
  CreateEditorOptions,
  EditorHost,
  GoTipeEditor,
  SetContentOptions,
} from "./types/editor";
import type { Decoration, ViewState } from "./types/view";
import type { WasmModuleLoader } from "./wasm-bridge";

export { toSafeHref } from "./security/urls";

/**
 * Creates an editor with an explicit WASM loader (`null` = JS engine only).
 * Public entries: `createEditor` from `@gotipe/core` (WASM with JS fallback)
 * and from `@gotipe/core/js` (JS engine, no reference to `@gotipe/wasm`).
 */
export async function createEditorWithLoader(
  options: CreateEditorOptions,
  loader: WasmModuleLoader | null,
): Promise<GoTipeEditor> {
  const { bridge, resolved, schema, htmlSchema, schemaJson } = await initializeEditor(
    options,
    loader,
  );
  const schemaForCommands = commandSchema(schema);
  const host: EditorHost = options.host ?? {};
  let editable = options.editable !== false;

  type Listener = (...args: unknown[]) => void;
  const listeners = new Map<string, Set<Listener>>();
  let destroyed = false;
  let mountedElement: HTMLElement | null = null;
  let mountAbort: AbortController | null = null;
  let mountedInput: ReturnType<typeof mountSurface> | null = null;
  let clipboardHandler: ClipboardHandler | null = null;
  let scheduleDomSelectionRestore: (() => void) | null = null;
  let restoreDomSelectionImmediately: (() => boolean) | null = null;
  let readSelectionFromDOM: GoTipeEditor["getDOMSelection"] | null = null;
  const caretAt = (blockId: string, offset = 0): ViewState["selection"] => ({
    type: "text",
    anchor: { blockId, offset },
    head: { blockId, offset },
  });
  let currentSelection = caretAt("");

  let storedMarks: { type: string; attrs: Record<string, unknown> }[] | null = null;
  // Every selection the editor takes moves off inline atoms (editor/atom-selection.ts).
  const atoms = createAtomSelection(schema.marks, () => view.get().blocks);
  // `changed`: the document changed since the view was last read (a transaction, a merge).
  const select = (value: ViewState["selection"], changed = false) => {
    let next = value;
    if (atoms.enabled) {
      if (changed) view.invalidate();
      next = atoms.snap(value, currentSelection);
      view.invalidate(); // the view read above holds the previous selection
    }
    // The same selection keeps its object: the typing undo step follows it (typing-group.ts).
    if (JSON.stringify(next) !== JSON.stringify(currentSelection)) currentSelection = next;
  };

  let extensionLifecycle: ReturnType<typeof createExtensionLifecycle> | null = null;
  const transactionFilters = createTransactionFilters();
  const transactions = createTransactions({
    beforeMutation: (reason) => mountedInput?.interrupt(reason),
    collaboration: bridge,
    get destroyed() {
      return destroyed;
    },
    get selection() {
      return currentSelection;
    },
    set selection(value) {
      select(value, true);
    },
    get storedMarks() {
      return storedMarks;
    },
    set storedMarks(value) {
      storedMarks = atoms.marks(value);
    },
    getDocumentJSON: () => bridge.getState(),
    apply: (transaction) => {
      if (bridge.isCollaborating && atoms.enabled)
        htmlSchema.atoms?.rememberLocal(view.get().blocks, transaction, atoms.isAtomic);
      return bridge.apply(transaction);
    },
    preview: (transaction) => bridge.preview(transaction),
    restoreDocument: (state) => bridge.restoreState(schemaJson, state),
    getViewState: () => editor.getViewState(),
    invalidate: () => view.invalidate(),
    publishUpdate: () => editor.emit("update", { editor }),
    publishSelection: () => editor.emit("selectionChange", { editor }),
    publishView: () => editor.emit("viewStateChange", editor.getViewState()),
    scheduleSelectionRestore: () => scheduleDomSelectionRestore?.(),
    restoreSelectionNow: () => {
      restoreDomSelectionImmediately?.();
    },
    shouldInspectTransaction: () =>
      transactionFilters.size > 0 || !!listeners.get("transaction")?.size,
    filterTransaction: (context) => transactionFilters.check(context),
    publishTransaction: (context) => editor.emit("transaction", { editor, ...context }),
  });

  const view = createViewState({
    getDocumentJSON: () => bridge.getState(),
    getSelection: () => currentSelection,
    isAtomic: atoms.isAtomic,
    getStoredMarks: () => storedMarks,
    canUndo: () => transactions.canUndo,
    canRedo: () => transactions.canRedo,
  });

  const hostActions = createHostActions(host, {
    compositionInterrupted: () => editor.emit("compositionInterrupted"),
    emitError: (error) => editor.emit("error", error),
    hasErrorListeners: () => !!listeners.get("error")?.size,
  });
  const collaboration = createCollaboration(bridge, {
    beforeMutation: (reason) => mountedInput?.interrupt(reason),
    get destroyed() {
      return destroyed;
    },
    get selection() {
      return currentSelection;
    },
    set selection(value) {
      select(value, true);
    },
    resetHistory: () => {
      transactions.resetHistory();
      view.invalidate();
    },
    isAtomic: atoms.enabled ? atoms.isAtomic : null,
    atoms: htmlSchema.atoms,
    // `origin: "repair"` tells listeners (TrailingNode) this is not a local edit.
    repair: (transaction) => {
      const metadata = { ...transaction.metadata, origin: "repair" };
      transactions.dispatch({ ...transaction, metadata });
    },
    changed: () => {
      storedMarks = null;
      view.invalidate();
      editor.emit("selectionChange", { editor });
      editor.emit("update", { editor });
      editor.emit("viewStateChange", editor.getViewState());
      scheduleDomSelectionRestore?.();
    },
  });

  const editor: GoTipeEditor = {
    get isDestroyed() {
      return destroyed;
    },
    get element() {
      return mountedElement;
    },

    get engine() {
      return bridge.engine;
    },

    get host() {
      return host;
    },

    get isEditable() {
      return editable;
    },

    get isComposing() {
      return mountedInput?.composing ?? false;
    },

    setEditable(next: boolean): void {
      if (next === editable) return;
      mountedInput?.interrupt("setEditable");
      editable = next;
      if (mountedElement) {
        mountedElement.setAttribute("contenteditable", editable ? "true" : "false");
        mountedElement.setAttribute("aria-readonly", editable ? "false" : "true");
      }
      view.invalidate();
      this.emit("editableChange", editable);
      this.emit("viewStateChange", this.getViewState());
    },

    setDecorations(layer: string, decorations: Decoration[]): void {
      const next = decorations.slice();
      if (mountedInput?.deferPresentation(layer, () => this.setDecorations(layer, next))) return;
      if (!view.setLayer(layer, next)) return;
      this.emit("decorationsChange", { layer });
      this.emit("viewStateChange", this.getViewState());
    },

    getDecorations(layer?: string): Decoration[] {
      return view.decorations(layer);
    },

    reportError: hostActions.reportError,
    openLink: hostActions.openLink,
    enableCollaboration: (peerId) =>
      startCollaboration(editor, bridge, collaboration.enable, peerId),
    getCollaborationUpdate: collaboration.getUpdate,
    receiveCollaborationUpdate: collaboration.receiveUpdate,

    getViewState(): ViewState {
      return view.get();
    },

    getJSON(): Document {
      const state = bridge.getState();
      const raw = JSON.parse(state);
      return fromWasmDoc(raw);
    },

    getHTML(): string {
      return bridge.exportHtml();
    },

    getMarkdown(): string {
      return bridge.exportMarkdown();
    },

    getText(): string {
      return blocksToText(this.getViewState().blocks);
    },

    focus(position?: "start" | "end"): void {
      if (!mountedElement) return;

      const state = this.getViewState();
      if (state.blocks.length === 0) return;

      if (position === "start") {
        const first = state.blocks[0]!;
        currentSelection = caretAt(first.id);
      } else if (position === "end") {
        const last = state.blocks[state.blocks.length - 1]!;
        const end = blockTextLength(last);
        currentSelection = caretAt(last.id, end);
      } else if (!currentSelection.anchor.blockId) {
        const first = state.blocks[0]!;
        currentSelection = caretAt(first.id);
      }

      mountedElement.focus({ preventScroll: true });
      restoreDomSelectionImmediately?.();
      scheduleDomSelectionRestore?.();
    },

    setSelection(selection): void {
      select({
        type: "text",
        anchor: { ...selection.anchor },
        head: { ...selection.head },
      });
      view.invalidate();
      this.emit("selectionChange", { editor: this });
      this.emit("viewStateChange", this.getViewState());
      restoreDomSelectionImmediately?.();
      scheduleDomSelectionRestore?.();
    },

    getDOMSelection() {
      const selection = destroyed ? null : readSelectionFromDOM?.();
      return selection ? { anchor: { ...selection.anchor }, head: { ...selection.head } } : null;
    },

    syncSelectionFromDOM(): void {
      const selection = readSelectionFromDOM?.();
      if (!selection) return;
      select({ type: "text", anchor: { ...selection.anchor }, head: { ...selection.head } });
      view.invalidate();
    },

    getSlashCommands(): SlashCommandDef[] {
      const commands: SlashCommandDef[] = [];
      for (const ext of resolved) {
        if (ext.slashCommands) {
          commands.push(...ext.slashCommands);
        }
      }
      return commands;
    },
    hasExtension: (name) => resolved.some((extension) => extension.name === name),

    chain(): ChainableCommands {
      return new ChainableCommands(this, schemaForCommands);
    },

    dispatch(transaction: object): boolean {
      transactionFilters.assertIdle();
      return transactions.dispatch(transaction);
    },
    previewTransaction(transaction) {
      return transactions.preview(transaction);
    },
    addTransactionFilter(filter) {
      if (destroyed) throw new GoTipeError("EDITOR_NOT_INITIALIZED", "The editor was destroyed");
      return transactionFilters.add(filter);
    },
    undo(): boolean {
      return transactions.undo();
    },
    redo(): boolean {
      return transactions.redo();
    },

    setContent(content: string | object, setOptions?: SetContentOptions): void {
      const json = typeof content === "string" ? parseHtmlDocument(content, htmlSchema) : content;
      const wasmJson = toWasmDoc(json as Record<string, unknown>);
      mountedInput?.interrupt("setContent");
      const previousState =
        setOptions?.addToHistory || setOptions?.preserveSelection ? bridge.getState() : null;
      // The DOM may be ahead of the model (selectionchange is async): sync first.
      if (setOptions?.preserveSelection) {
        const domSelection = readSelectionFromDOM?.();
        if (domSelection?.anchor.blockId)
          select({
            type: "text",
            anchor: { ...domSelection.anchor },
            head: { ...domSelection.head },
          });
      }
      const previousSelection = currentSelection;
      const hadFocus =
        !!mountedElement &&
        typeof document !== "undefined" &&
        !!document.activeElement &&
        mountedElement.contains(document.activeElement);
      if (bridge.isCollaborating && currentSelection.anchor.blockId)
        bridge.setSelection(JSON.stringify(viewToEngineSelection(currentSelection)));
      bridge.create(schemaJson, JSON.stringify(wasmJson));
      view.invalidate();
      storedMarks = null;
      transactions.resetHistory(
        setOptions?.addToHistory && previousState
          ? { state: previousState, selection: previousSelection }
          : undefined,
      );

      try {
        const raw = JSON.parse(bridge.getState()) as Record<string, unknown>;
        const parsed = fromWasmDoc(raw);
        const blocks = ((parsed.blocks as ViewState["blocks"]) ?? []) as ViewState["blocks"];
        const mapped =
          setOptions?.preserveSelection && previousState && previousSelection.anchor.blockId
            ? mapSelectionToDocument(
                previousSelection,
                fromWasmDoc(JSON.parse(previousState) as Record<string, unknown>)
                  .blocks as ViewState["blocks"],
                blocks,
              )
            : null;
        const first = mapped ? null : findFirstSelectableBlock(blocks);
        if (mapped) select(mapped);
        else currentSelection = first ? caretAt(first.id) : caretAt("");
      } catch {
        currentSelection = caretAt("");
      }

      this.emit("update", { editor: this });
      this.emit("selectionChange", { editor: this });
      this.emit("viewStateChange", this.getViewState());
      // Never pull focus into the editor: restore the DOM selection only when
      // the editor had focus (or nothing asked us to keep the selection).
      const mayTouchDomSelection = setOptions?.preserveSelection ? hadFocus : true;
      if (currentSelection.anchor.blockId && mayTouchDomSelection) {
        restoreDomSelectionImmediately?.();
        scheduleDomSelectionRestore?.();
      }
    },

    validate(content: string | object): boolean {
      try {
        const document = typeof content === "string" ? JSON.parse(content) : content;
        return bridge.validate(JSON.stringify(toWasmDoc(document)));
      } catch {
        return false;
      }
    },

    isActive(name: string, attrs?: Record<string, unknown>): boolean {
      const state = this.getViewState();
      if (state.toolbar.activeMarks.includes(name)) return true;
      if (state.toolbar.activeBlockType === name) {
        if (!attrs) return true;
        return Object.entries(attrs).every(([k, v]) => state.toolbar.activeBlockAttrs[k] === v);
      }
      return false;
    },

    getCurrentBlock() {
      const state = this.getViewState();
      const blockId = state.selection.anchor.blockId;
      const block = findBlockInTree(state.blocks, blockId);
      if (!block) return null;
      return {
        type: block.type,
        id: block.id,
        attrs: block.attrs,
        isEmpty:
          block.content === null ||
          (Array.isArray(block.content) && block.content.length === 0) ||
          (Array.isArray(block.content) && block.content.every((s) => s.text === "")),
      };
    },

    isEmpty(): boolean {
      const state = this.getViewState();
      if (state.blocks.length === 0) return true;
      if (state.blocks.length !== 1) return false;
      const first = state.blocks[0];
      if (!first || first.type !== "paragraph") return false;
      if (first.content === null) return true;
      if (Array.isArray(first.content)) {
        return first.content.length === 0 || first.content.every((s) => s.text === "");
      }
      return false;
    },

    on<K extends keyof EditorEvents>(event: K, handler: EditorEvents[K]): () => void {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(handler as Listener);
      return () => this.off(event, handler);
    },

    off<K extends keyof EditorEvents>(event: K, handler: EditorEvents[K]): void {
      listeners.get(event)?.delete(handler as Listener);
    },

    emit<K extends keyof EditorEvents>(event: K, ...args: Parameters<EditorEvents[K]>): void {
      const set = listeners.get(event);
      if (set) {
        for (const fn of set) {
          try {
            (fn as (...a: unknown[]) => void)(...args);
          } catch (error) {
            const failure = new GoTipeError(
              "EXTENSION_ERROR",
              error instanceof Error ? error.message : `Listener failed: ${event}`,
            );
            if (event === "error") console.error(failure);
            else hostActions.reportError(failure);
          }
        }
      }
    },

    mount(element: HTMLElement): void {
      if (mountedElement) this.unmount();
      mountedElement = element;
      mountAbort = new AbortController();
      clipboardHandler = new ClipboardHandler(
        this,
        clipboardOptions(resolved, this, (draft) => createEditorWithLoader(draft, null)),
      );
      const extensions = createExtensionEvents(resolved, this);
      const selection = mountSurface(
        element,
        mountAbort.signal,
        {
          get editable() {
            return editable;
          },
          get selection() {
            return currentSelection;
          },
          set selection(value) {
            select(value);
          },
          get storedMarks() {
            return storedMarks;
          },
          set storedMarks(value) {
            storedMarks = atoms.marks(value);
          },
          clipboard: clipboardHandler,
          getViewState: () => this.getViewState(),
          getDocument: () => this.getJSON(),
          dispatch: (transaction, typing) => {
            transactionFilters.assertIdle();
            return transactions.dispatch(transaction, typing);
          },
          liftListItem: () => this.chain().setBlockType("paragraph").run(),
          publishSelection: () => {
            view.invalidate();
            this.emit("selectionChange", { editor: this });
            this.emit("viewStateChange", this.getViewState());
          },
          redrawBlocks: (ids) => {
            view.redraw(ids);
            this.emit("viewStateChange", this.getViewState());
          },
          openLink: (href, options) => this.openLink(href, options),
          reportError: (error) => this.reportError(error),
          notifyFocus: (focused) => this.emit(focused ? "focus" : "blur", { editor: this }),
          openSlashMenu: () => this.emit("openSlashMenu"),
          applyInputRules: extensions.input,
          handleKeybinding: extensions.keydown,
        },
        !!options.autofocus,
      );
      readSelectionFromDOM = selection.read;
      mountedInput = selection;
      restoreDomSelectionImmediately = selection.restore;
      scheduleDomSelectionRestore = selection.schedule;
    },

    unmount(): void {
      if (mountedElement) {
        mountAbort?.abort();
        mountAbort = null;
        mountedInput = null;
        scheduleDomSelectionRestore = null;
        restoreDomSelectionImmediately = null;
        readSelectionFromDOM = null;
        mountedElement.removeAttribute("contenteditable");
        mountedElement.removeAttribute("data-gotipe-editor");
        mountedElement = null;
        clipboardHandler?.destroy();
        clipboardHandler = null;
      }
    },

    destroy(): void {
      if (destroyed) return;
      extensionLifecycle?.destroy();
      this.emit("destroy", { editor: this });
      this.unmount();
      bridge.destroy();
      listeners.clear();
      transactionFilters.clear();
      destroyed = true;
    },
  };

  const initialBlock = findFirstSelectableBlock(editor.getViewState().blocks);
  if (initialBlock) {
    currentSelection = caretAt(initialBlock.id);
    view.invalidate();
  }

  // Wire up option callbacks
  if (options.onUpdate) editor.on("update", options.onUpdate);
  if (options.onSelectionChange) editor.on("selectionChange", options.onSelectionChange);
  if (options.onFocus) editor.on("focus", options.onFocus);
  if (options.onBlur) editor.on("blur", options.onBlur);
  if (options.onCreate) editor.on("create", options.onCreate);
  if (options.onDestroy) editor.on("destroy", options.onDestroy);

  try {
    extensionLifecycle = createExtensionLifecycle(resolved, editor);
  } catch (error) {
    editor.destroy();
    throw error;
  }
  editor.emit("create", { editor });

  return editor;
}
