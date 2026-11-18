import type { ChainableCommands } from "../chain";
import type { GoTipeError } from "../error";
import type { CollaborationUpdateOptions, EngineMode } from "../wasm-bridge";
import type { Document } from "./block";
import type { EditorEvents } from "./events";
import type { Extension, SlashCommandDef } from "./extension";
import type { TransactionFilter } from "./state";
import type { Decoration, ViewState } from "./view";

/**
 * Everything the editor needs from its host application. All members are
 * optional; without a host the editor keeps its standalone behaviour.
 */
export interface EditorHost {
  /** Optional image catalogs. Search and credentials belong to the host. */
  imageSources?: ImageSource[];
  /**
   * Persist a pasted/dropped/picked image or file. Returns the path or URL that
   * goes into the document (e.g. `assets/diagram.png`). Throw or reject to
   * report a failure — the editor turns it into an `error` event.
   */
  saveAsset?: (
    file: Blob,
    info: { kind: "image" | "file"; name: string; mediaType: string; size: number },
  ) => Promise<{ src: string; name?: string }>;
  /**
   * Resolve a document path (`assets/diagram.png`) to something an <img> can
   * show under the host's CSP — typically a `data:` URL. Return `null` when the
   * asset is unavailable.
   */
  resolveAsset?: (src: string) => Promise<string | null> | string | null;
  /**
   * A file `saveAsset` stored that the editor then did not insert: the paste was replaced by a
   * newer one, the document or selection changed during the upload, the editor became read-only
   * or was destroyed, or another file of the same paste failed. The host may delete it.
   */
  discardAsset?: (asset: { src: string; name: string; kind: "image" | "file" }) => void;
  /**
   * Open a link. `newTab` is what the editor does without this callback (`window.open`).
   * `target` is the link's own (`"_self"`, `"_blank"`), `null` when the document gives none,
   * as for a file block's name: the host decides where the link opens.
   */
  openLink?: (
    href: string,
    info: { blockId: string | null; newTab: boolean; target: string | null },
  ) => void;
  /** Called for every editor error (also emitted as the `error` event). */
  onError?: (error: GoTipeError) => void;
}

export interface ImageSourceItem {
  id: string;
  src: string;
  alt: string;
  thumbnail?: string;
  attribution?: string;
}

export interface ImageSource {
  id: string;
  label: string;
  search(query: string, signal: AbortSignal): Promise<ImageSourceItem[]>;
}

export interface SetContentOptions {
  /**
   * Keep the caret/selection where it was when the block ids still exist
   * (falls back to the same block index). Default: `false` (caret to start).
   */
  preserveSelection?: boolean;
  /** Push the previous document onto the undo stack. Default: `false` (reset history). */
  addToHistory?: boolean;
}

export interface CreateEditorOptions {
  extensions: (Extension | Extension[])[];
  content?: string | object;
  editable?: boolean;
  autofocus?: boolean | "start" | "end";
  /**
   * Engine: `"auto"` (default) tries the WASM core and falls back to the JS
   * engine; `"js"` never loads WASM (strict CSP without `wasm-unsafe-eval`);
   * `"wasm"` fails with `WASM_INIT_FAILED` instead of falling back.
   */
  engine?: EngineMode;
  /** Host integration: assets, links, errors. */
  host?: EditorHost;
  onUpdate?: (props: { editor: GoTipeEditor }) => void;
  onSelectionChange?: (props: { editor: GoTipeEditor }) => void;
  onFocus?: (props: { editor: GoTipeEditor }) => void;
  onBlur?: (props: { editor: GoTipeEditor }) => void;
  onCreate?: (props: { editor: GoTipeEditor }) => void;
  onDestroy?: (props: { editor: GoTipeEditor }) => void;
}

export interface GoTipeEditor {
  /** Engine in use: `"wasm"` or `"js"`. */
  readonly engine: "wasm" | "js";
  /** Host callbacks passed in `createEditor({ host })` (empty object when none). */
  readonly host: EditorHost;
  /** Whether the document accepts input. */
  readonly isEditable: boolean;
  /**
   * The browser is composing text (IME, dead keys) in the mounted editor. Until it ends, the
   * text of the composing block belongs to the browser: decoration layers wait, and renderers
   * must not redraw that block or move the native selection.
   */
  readonly isComposing: boolean;
  /** Switch read-only mode at runtime. Emits `editableChange`. */
  setEditable(editable: boolean): void;
  /**
   * Replace a named layer of decorations (review proposals, comments, search…).
   * Decorations never touch the document; an empty array clears the layer.
   */
  setDecorations(layer: string, decorations: Decoration[]): void;
  getDecorations(layer?: string): Decoration[];
  /** Report an error: emits `error` and calls `host.onError`. Never throws. */
  reportError(error: GoTipeError): void;
  /**
   * Open a link through `host.openLink` (or `window.open` without a host). `target` goes to
   * the host as is; without a host only `newTab` decides.
   */
  openLink(
    href: string,
    options?: { blockId?: string | null; newTab?: boolean; target?: string | null },
  ): void;
  getViewState(): ViewState;
  getJSON(): Document;
  getHTML(): string;
  getMarkdown(): string;
  getText(): string;
  /** Enable the owned CRDT engine. Requires WASM; the replica peer ID stays fixed. */
  enableCollaboration(peerId: string): void;
  /**
   * Without options: the full state, baseline included. `{ after }` returns only
   * this replica's operations after a Lamport clock; `{ missingFrom }` those a
   * peer's full state lacks.
   */
  getCollaborationUpdate(options?: CollaborationUpdateOptions): Uint8Array;
  receiveCollaborationUpdate(update: Uint8Array): void;
  focus(position?: "start" | "end"): void;
  setSelection(selection: {
    anchor: { blockId: string; offset: number };
    head: { blockId: string; offset: number };
  }): void;
  /** Detached native selection; never changes model state or emits events. Null without an owned DOM range. */
  getDOMSelection(): {
    anchor: { blockId: string; offset: number };
    head: { blockId: string; offset: number };
  } | null;
  syncSelectionFromDOM(): void;
  getSlashCommands(): SlashCommandDef[];
  /**
   * Whether the editor was created with an extension of this name, alone or in a preset. A UI
   * asks before it offers what only an extension answers, as `BlockEditor` does for AI controls.
   */
  hasExtension(name: string): boolean;
  chain(): ChainableCommands;
  /** Returns false when a registered filter cancels the transaction. */
  dispatch(transaction: object): boolean;
  /** Stage document operations on a detached snapshot; does not run filters or commit. */
  previewTransaction(transaction: object): Document;
  /** Validated local dispatch only; remote synchronization and history are not filtered. */
  addTransactionFilter(filter: TransactionFilter): () => void;
  setContent(content: string | object, options?: SetContentOptions): void;
  /**
   * Validate a public document object; invalid input returns false. A string is not read and
   * returns false: parse JSON yourself, `validate(JSON.parse(json))`. A string is HTML only in
   * `content` and `setContent`.
   */
  validate(content: object): boolean;
  isActive(name: string, attrs?: Record<string, unknown>): boolean;
  getCurrentBlock(): {
    type: string;
    id: string;
    attrs: Record<string, unknown>;
    isEmpty: boolean;
  } | null;
  isEmpty(): boolean;
  on<K extends keyof EditorEvents>(event: K, handler: EditorEvents[K]): () => void;
  off<K extends keyof EditorEvents>(event: K, handler: EditorEvents[K]): void;
  emit<K extends keyof EditorEvents>(event: K, ...args: Parameters<EditorEvents[K]>): void;
  /**
   * Makes every change committed while `fn` runs one undo step; Redo restores all of it and
   * Undo restores the selection from before it. Events are still emitted per transaction. A
   * nested call joins the outer one; only what `fn` does before it returns is grouped.
   */
  batch(fn: () => void): void;
  undo(): boolean;
  redo(): boolean;
  mount(element: HTMLElement): void;
  unmount(): void;
  destroy(): void;
  readonly isDestroyed: boolean;
  /** The mounted editor surface; null before mount and after unmount. */
  readonly element: HTMLElement | null;
}
