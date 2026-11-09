import { ChainableCommands } from "./chain";
import { ClipboardHandler } from "./clipboard/handler";
import { GoTipeError } from "./error";
import { createTextWalker, documentTextOf } from "./dom/text-walker";
import { applyPolyfills } from "./polyfills";
import type { EditorEvents } from "./types/events";
import type { Extension, MarkSpec, NodeSpec, SlashCommandDef } from "./types/extension";
import type { Decoration, ViewState } from "./types/view";
import { type EngineMode, WasmBridge, type WasmModuleLoader } from "./wasm-bridge";

/**
 * Everything the editor needs from its host application. All members are
 * optional; without a host the editor keeps its standalone behaviour.
 */
export interface EditorHost {
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
  /** Open a link. Without it the editor falls back to `window.open`. */
  openLink?: (href: string, info: { blockId: string | null; newTab: boolean }) => void;
  /** Called for every editor error (also emitted as the `error` event). */
  onError?: (error: GoTipeError) => void;
}

export interface SetContentOptions {
  /**
   * Keep the caret/selection where it was when the block ids still exist
   * (falls back to the same block index). Default: `false` (caret to start).
   */
  preserveSelection?: boolean;
  /** Push the previous document onto the undo stack. Default: `false`. */
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
  /** Open a link through `host.openLink` (or `window.open` without a host). */
  openLink(href: string, options?: { blockId?: string | null; newTab?: boolean }): void;
  getViewState(): ViewState;
  getJSON(): object;
  getHTML(): string;
  getMarkdown(): string;
  getText(): string;
  focus(position?: "start" | "end"): void;
  setSelection(selection: {
    anchor: { blockId: string; offset: number };
    head: { blockId: string; offset: number };
  }): void;
  syncSelectionFromDOM(): void;
  getSlashCommands(): SlashCommandDef[];
  chain(): ChainableCommands;
  dispatch(transaction: object): void;
  setContent(content: string | object, options?: SetContentOptions): void;
  validate(content: string | object): boolean;
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
  undo(): boolean;
  redo(): boolean;
  mount(element: HTMLElement): void;
  unmount(): void;
  destroy(): void;
  readonly isDestroyed: boolean;
}

function generateBlockId(): string {
  return crypto.randomUUID();
}

// ---- Format conversion: JS ↔ Rust WASM ----
// JS uses:  { type, content: [...], marks: [{ type: 'bold' }] }
// Rust uses: { block_type, content: { type: "RichText", value: [...] }, marks: [{ mark_type: 'bold', attrs: {} }] }

function toWasmMark(mark: { type: string; attrs?: Record<string, unknown> }): {
  mark_type: string;
  attrs: Record<string, unknown>;
} {
  return { mark_type: mark.type, attrs: mark.attrs ?? {} };
}

function toWasmBlock(block: Record<string, unknown>): Record<string, unknown> {
  const content = block.content;
  let wasmContent: unknown;

  if (content === null || content === undefined) {
    wasmContent = { type: "Empty" };
  } else if (typeof content === "string") {
    wasmContent = { type: "Raw", value: content };
  } else if (Array.isArray(content)) {
    wasmContent = {
      type: "RichText",
      value: content.map((span: { text: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }) => ({
        text: span.text,
        marks: (span.marks ?? []).map(toWasmMark),
      })),
    };
  } else {
    wasmContent = content;
  }

  const children = Array.isArray(block.children)
    ? (block.children as Record<string, unknown>[]).map(toWasmBlock)
    : [];

  return {
    id: block.id,
    block_type: block.type ?? block.block_type,
    attrs: block.attrs ?? {},
    content: wasmContent,
    children,
  };
}

function toWasmDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const blocks = Array.isArray(doc.blocks) ? (doc.blocks as Record<string, unknown>[]).map(toWasmBlock) : [];
  return { version: doc.version ?? 1, blocks };
}

function fromWasmMark(mark: { mark_type: string; attrs?: Record<string, unknown> }): {
  type: string;
  attrs?: Record<string, unknown>;
} {
  return { type: mark.mark_type, attrs: mark.attrs ?? {} };
}

function fromWasmBlock(block: Record<string, unknown>): Record<string, unknown> {
  const rawContent = block.content as Record<string, unknown> | null;
  let content: unknown;

  if (!rawContent || rawContent.type === "Empty") {
    content = null;
  } else if (rawContent.type === "Raw") {
    content = rawContent.value;
  } else if (rawContent.type === "RichText") {
    content = Array.isArray(rawContent.value)
      ? (rawContent.value as { text: string; marks?: { mark_type: string; attrs?: Record<string, unknown> }[] }[]).map(
          (span) => ({
            text: span.text,
            marks: (span.marks ?? []).map(fromWasmMark),
          }),
        )
      : [];
  } else {
    content = rawContent;
  }

  const children = Array.isArray(block.children)
    ? (block.children as Record<string, unknown>[]).map(fromWasmBlock)
    : [];

  return {
    id: block.id,
    type: block.block_type ?? block.type,
    attrs: block.attrs ?? {},
    content,
    children,
  };
}

function fromWasmDoc(doc: Record<string, unknown>): Record<string, unknown> {
  const blocks = Array.isArray(doc.blocks) ? (doc.blocks as Record<string, unknown>[]).map(fromWasmBlock) : [];
  return { version: doc.version ?? 1, blocks };
}

// ---- Marks position helpers ----

function findBlockInTree(blocks: ViewState["blocks"], blockId: string): ViewState["blocks"][0] | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.children.length > 0) {
      const found = findBlockInTree(block.children, blockId);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Get marks at a cursor position by inheriting from the character to the LEFT.
 * At offset 0 (start of block), returns [] since there's nothing to the left.
 * This matches standard rich text editor behavior (ProseMirror, Notion, etc.)
 */
function getMarksAt(
  blocks: ViewState["blocks"],
  blockId: string,
  offset: number,
  inherit = true,
): { type: string; attrs: Record<string, unknown> }[] {
  const block = findBlockInTree(blocks, blockId);
  if (!block || !Array.isArray(block.content) || block.content.length === 0) return [];

  const charIndex = inherit ? offset - 1 : offset;
  if (charIndex < 0) return [];

  let pos = 0;
  for (const span of block.content) {
    const spanEnd = pos + span.text.length;
    if (charIndex >= pos && charIndex < spanEnd) {
      return span.marks.map((m) => ({ type: m.type, attrs: m.attrs ?? {} }));
    }
    pos = spanEnd;
  }

  return [];
}

// ---- Block tree navigation helpers ----

/** Check if a block has empty/no text content */
function isBlockEmpty(block: ViewState["blocks"][0]): boolean {
  const normalizedLength = (text: string): number =>
    text.replace(/[\s\u200B-\u200D\uFEFF]/g, "").length;

  if (block.content === null) return true;
  if (Array.isArray(block.content)) {
    return block.content.length === 0 || block.content.every((s) => normalizedLength(s.text) === 0);
  }
  if (typeof block.content === "string") return normalizedLength(block.content) === 0;
  return true;
}

/** Find a block's parent in the tree */
function findParentBlock(
  blocks: ViewState["blocks"],
  childId: string,
): { parent: ViewState["blocks"][0]; index: number } | null {
  for (const b of blocks) {
    for (let i = 0; i < b.children.length; i++) {
      if (b.children[i]!.id === childId) return { parent: b, index: i };
    }
    const found = findParentBlock(b.children, childId);
    if (found) return found;
  }
  return null;
}

/** Find a block's location (parent array + index) */
function findBlockLocation(
  blocks: ViewState["blocks"],
  id: string,
  parentId: string | null = null,
): { parentId: string | null; index: number } | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.id === id) return { parentId, index: i };
    const found = findBlockLocation(blocks[i]!.children, id, blocks[i]!.id);
    if (found) return found;
  }
  return null;
}

/** Find the next sibling after a block (split result) in the tree */
function findBlockAndSibling(
  blocks: ViewState["blocks"],
  blockId: string,
): { id: string } | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.id === blockId) {
      const next = blocks[i + 1];
      return next ? { id: next.id } : null;
    }
    const found = findBlockAndSibling(blocks[i]!.children, blockId);
    if (found) return found;
  }
  return null;
}

/** Find the previous sibling before a block in the tree */
function findBlockAndPreviousSibling(
  blocks: ViewState["blocks"],
  blockId: string,
): { id: string } | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]!.id === blockId) {
      const prev = blocks[i - 1];
      return prev ? { id: prev.id } : null;
    }
    const found = findBlockAndPreviousSibling(blocks[i]!.children, blockId);
    if (found) return found;
  }
  return null;
}

const LIST_CONTAINER_TYPES = new Set(["bulletList", "orderedList", "todoList"]);
const ENTER_EXITS_TO_PARAGRAPH_TYPES = new Set(["heading", "blockquote", "callout"]);

function findFirstSelectableBlock(
  blocks: ViewState["blocks"],
): ViewState["blocks"][number] | null {
  for (const block of blocks) {
    if (LIST_CONTAINER_TYPES.has(block.type) && block.children.length > 0) {
      const nested = findFirstSelectableBlock(block.children);
      if (nested) return nested;
    }
    return block;
  }
  return null;
}

// ---- Transaction format conversion: JS step → Rust externally-tagged enum ----
// JS: { type: "insertText", blockId: "b1", offset: 5, text: "Hi", marks: [] }
// Rust: { "InsertText": { "block_id": "b1", "offset": 5, "text": "Hi", "marks": [] } }

function pascalCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toWasmStep(step: Record<string, unknown>): Record<string, unknown> {
  const type = step.type as string;
  const tag = pascalCase(type);

  switch (type) {
    case "insertText":
      return {
        [tag]: {
          block_id: step.blockId,
          offset: step.offset,
          text: step.text,
          marks: Array.isArray(step.marks)
            ? (step.marks as { type: string; attrs?: Record<string, unknown> }[]).map(toWasmMark)
            : [],
        },
      };
    case "deleteText":
      return { [tag]: { block_id: step.blockId, from: step.from, to: step.to } };
    case "insertBlock":
      return {
        [tag]: {
          parent_id: step.parentId ?? null,
          index: step.index,
          block: toWasmBlock(step.block as Record<string, unknown>),
        },
      };
    case "deleteBlock":
      return { [tag]: { block_id: step.blockId } };
    case "moveBlock":
      return {
        [tag]: {
          block_id: step.blockId,
          new_parent_id: step.newParentId ?? null,
          new_index: step.newIndex,
        },
      };
    case "setBlockAttrs":
      return { [tag]: { block_id: step.blockId, attrs: step.attrs } };
    case "setBlockType":
      return { [tag]: { block_id: step.blockId, new_type: step.newType, attrs: step.attrs ?? {} } };
    case "addMark": {
      const mark = step.mark as { type: string; attrs?: Record<string, unknown> };
      return {
        [tag]: {
          block_id: step.blockId,
          from: step.from,
          to: step.to,
          mark: toWasmMark(mark),
        },
      };
    }
    case "removeMark":
      return { [tag]: { block_id: step.blockId, from: step.from, to: step.to, mark_type: step.markType } };
    case "splitBlock":
      return { [tag]: { block_id: step.blockId, offset: step.offset } };
    case "mergeBlocks":
      return { [tag]: { block_id: step.blockId, target_id: step.targetId } };
    case "deleteRange":
      return { [tag]: { block_id: step.blockId, from: step.from, to: step.to } };
    default:
      return step;
  }
}

function toWasmTransaction(tr: Record<string, unknown>): Record<string, unknown> {
  const steps = Array.isArray(tr.steps) ? (tr.steps as Record<string, unknown>[]).map(toWasmStep) : [];
  return { steps, selection: tr.selection ?? null, metadata: tr.metadata ?? {} };
}

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Returns the href when it is safe to open: http(s)/mailto URLs and relative
 * references (paths, `#fragments`, `?query`). Anything with another scheme
 * (`javascript:`, `data:`, `file:` …) is rejected.
 */
export function toSafeHref(href: string): string | null {
  const value = href.trim();
  if (!value) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip control chars that browsers ignore in schemes
  const compact = value.replace(/[\u0000-\u001F\u007F\s]+/g, "");
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(compact);
  if (!scheme) return value;
  return SAFE_LINK_PROTOCOLS.has(`${scheme[1]!.toLowerCase()}:`) ? value : null;
}

function blockTextLength(block: ViewState["blocks"][number]): number {
  if (Array.isArray(block.content)) return block.content.reduce((n, s) => n + s.text.length, 0);
  if (typeof block.content === "string") return block.content.length;
  return 0;
}

function flattenBlocks(blocks: ViewState["blocks"], out: ViewState["blocks"] = []): ViewState["blocks"] {
  for (const block of blocks) {
    out.push(block);
    if (block.children.length > 0) flattenBlocks(block.children, out);
  }
  return out;
}

/**
 * Maps a selection from one document to another after an external replacement:
 * by block id when it survived, otherwise by the position of the block in
 * document order; offsets are clamped to the new text.
 */
function mapSelectionToDocument(
  selection: { anchor: { blockId: string; offset: number }; head: { blockId: string; offset: number } },
  previous: ViewState["blocks"],
  next: ViewState["blocks"],
): {
  type: "text";
  anchor: { blockId: string; offset: number };
  head: { blockId: string; offset: number };
} | null {
  const prevFlat = flattenBlocks(previous);
  const nextFlat = flattenBlocks(next);
  if (nextFlat.length === 0) return null;
  const nextById = new Map(nextFlat.map((b) => [b.id, b] as const));
  const mapPoint = (point: { blockId: string; offset: number }) => {
    let target = nextById.get(point.blockId);
    if (!target) {
      const index = prevFlat.findIndex((b) => b.id === point.blockId);
      target = nextFlat[Math.min(Math.max(index, 0), nextFlat.length - 1)];
    }
    if (!target) return null;
    return { blockId: target.id, offset: Math.min(point.offset, blockTextLength(target)) };
  };
  const anchor = mapPoint(selection.anchor);
  const head = mapPoint(selection.head);
  if (!anchor || !head) return null;
  return { type: "text", anchor, head };
}

function resolveExtensions(extensions: (Extension | Extension[])[]): Extension[] {
  // Flatten nested arrays so presets (which are Extension[]) work with [DefaultPreset, MyExt]
  const flat: Extension[] = extensions.flat(Infinity) as Extension[];

  const resolved: Extension[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const extMap = new Map<string, Extension>();

  for (const ext of flat) {
    extMap.set(ext.name, ext);
  }

  function visit(ext: Extension): void {
    if (visited.has(ext.name)) return;
    if (visiting.has(ext.name)) {
      throw new GoTipeError(
        "EXTENSION_DEPENDENCY_CYCLE",
        `Circular dependency detected: ${ext.name}`,
        { extension: ext.name },
      );
    }

    visiting.add(ext.name);

    if (ext.dependencies) {
      for (const depName of ext.dependencies) {
        const dep = extMap.get(depName);
        if (dep) visit(dep);
      }
    }

    visiting.delete(ext.name);
    visited.add(ext.name);
    resolved.push(ext);
  }

  for (const ext of flat) {
    visit(ext);
  }

  return resolved;
}

function buildSchema(
  extensions: Extension[],
): { nodes: Record<string, Omit<NodeSpec, "name">>; marks: Record<string, Omit<MarkSpec, "name">> } {
  const nodes: Record<string, Omit<NodeSpec, "name">> = {};
  const marks: Record<string, Omit<MarkSpec, "name">> = {};

  for (const ext of extensions) {
    if (ext.nodes) {
      for (const node of ext.nodes) {
        const { name, ...spec } = node;
        nodes[name] = spec;
      }
    }
    if (ext.marks) {
      for (const mark of ext.marks) {
        const { name, ...spec } = mark;
        marks[name] = spec;
      }
    }
  }

  return { nodes, marks };
}

/**
 * Creates an editor with an explicit WASM loader (`null` = JS engine only).
 * Public entries: `createEditor` from `@gotipe/core` (WASM with JS fallback)
 * and from `@gotipe/core/js` (JS engine, no reference to `@gotipe/wasm`).
 */
export async function createEditorWithLoader(
  options: CreateEditorOptions,
  loader: WasmModuleLoader | null,
): Promise<GoTipeEditor> {
  applyPolyfills();

  const engineMode: EngineMode = options.engine ?? "auto";
  const bridge = new WasmBridge(engineMode === "js" ? null : loader, engineMode);
  await bridge.init();
  const host: EditorHost = options.host ?? {};
  let editable = options.editable !== false;
  const decorationLayers = new Map<string, Decoration[]>();
  const EMPTY_DECORATIONS: Decoration[] = [];

  const resolved = resolveExtensions(options.extensions);
  const schema = buildSchema(resolved);
  const schemaJson = JSON.stringify(schema);

  const initialContent =
    options.content != null
      ? typeof options.content === "string"
        ? { blocks: [], version: 1 }
        : options.content
      : {
          blocks: [
            {
              id: generateBlockId(),
              type: "paragraph",
              attrs: {},
              content: null,
              children: [],
            },
          ],
          version: 1,
        };

  // Convert JS format to Rust WASM format before sending
  const wasmContent = toWasmDoc(initialContent as Record<string, unknown>);

  // Try WASM, fall back to JS-only mode on any error
  try {
    bridge.create(schemaJson, JSON.stringify(wasmContent));
  } catch (e) {
    if (engineMode === "wasm") {
      throw new GoTipeError("WASM_INIT_FAILED", e instanceof Error ? e.message : "WASM create failed");
    }
    console.warn("GoTipe WASM create failed, using JS fallback:", e);
    bridge.forceFallback(JSON.stringify(wasmContent));
  }

  // Store initial content for guaranteed fallback rendering
  const fallbackContent = initialContent as { blocks?: unknown[]; version?: number };

  // Event emitter
  type Listener = (...args: unknown[]) => void;
  const listeners = new Map<string, Set<Listener>>();
  let destroyed = false;
  let mountedElement: HTMLElement | null = null;
  let mountAbort: AbortController | null = null;
  let clipboardHandler: ClipboardHandler | null = null;
  let scheduleDomSelectionRestore: (() => void) | null = null;
  let restoreDomSelectionImmediately: (() => boolean) | null = null;
  let readSelectionFromDOM:
    | (() => {
        anchor: { blockId: string; offset: number };
        head: { blockId: string; offset: number };
      } | null)
    | null = null;
  let cachedViewState: ViewState | null = null;
  let currentSelection: {
    type: "text";
    anchor: { blockId: string; offset: number };
    head: { blockId: string; offset: number };
  } = {
    type: "text",
    anchor: { blockId: "", offset: 0 },
    head: { blockId: "", offset: 0 },
  };

  // Stored marks: when user toggles a mark with collapsed cursor,
  // these marks override position-based detection for the next typed character.
  // Cleared on selection change or after text insertion.
  let storedMarks: { type: string; attrs: Record<string, unknown> }[] | null = null;

  // Undo / Redo stacks — store serialised WASM state snapshots
  const MAX_HISTORY = 100;
  const undoStack: string[] = [];
  const redoStack: string[] = [];

  // Parsed-state cache: the JSON of the engine state is parsed once per change,
  // and unchanged top-level blocks keep their object identity (cheap re-renders).
  let lastStateJson: string | null = null;
  let lastParsed: Record<string, unknown> | null = null;
  const blockKeys = new WeakMap<object, string>();

  const withEmptyDecorations = (block: ViewState["blocks"][number]): ViewState["blocks"][number] => {
    block.decorations = EMPTY_DECORATIONS;
    for (const child of block.children) withEmptyDecorations(child);
    return block;
  };

  const shareBlocks = (
    prev: ViewState["blocks"],
    next: ViewState["blocks"],
  ): ViewState["blocks"] => {
    const prevById = new Map<string, ViewState["blocks"][number]>();
    for (const block of prev) prevById.set(block.id, block);
    return next.map((block) => {
      const key = JSON.stringify(block);
      const old = prevById.get(block.id);
      if (old && blockKeys.get(old) === key) return old;
      withEmptyDecorations(block);
      blockKeys.set(block, key);
      return block;
    });
  };

  // Blocks whose DOM must be rebuilt from the model (see correctDomFromWasmState).
  const renderEpochs = new Map<string, number>();

  const allDecorations = (): Decoration[] => {
    if (decorationLayers.size === 0) return EMPTY_DECORATIONS;
    const out: Decoration[] = [];
    for (const layer of decorationLayers.values()) out.push(...layer);
    return out;
  };

  const decorationBlockId = (d: Decoration): string | null =>
    "blockId" in d && typeof d.blockId === "string" ? d.blockId : null;

  const attachDecorations = (blocks: ViewState["blocks"]): ViewState["blocks"] => {
    const all = allDecorations();
    if (all.length === 0 && renderEpochs.size === 0) return blocks;
    const byBlock = new Map<string, Decoration[]>();
    for (const d of all) {
      const id = decorationBlockId(d);
      if (!id) continue;
      const list = byBlock.get(id);
      if (list) list.push(d);
      else byBlock.set(id, [d]);
    }
    if (byBlock.size === 0 && renderEpochs.size === 0) return blocks;
    const visit = (block: ViewState["blocks"][number]): ViewState["blocks"][number] => {
      const own = byBlock.get(block.id);
      const epoch = renderEpochs.get(block.id);
      let children = block.children;
      let childChanged = false;
      if (children.length > 0) {
        const mapped = children.map(visit);
        childChanged = mapped.some((c, i) => c !== children[i]);
        if (childChanged) children = mapped;
      }
      if (!own && !childChanged && epoch === undefined) return block;
      const next = { ...block, children, decorations: own ?? EMPTY_DECORATIONS };
      if (epoch !== undefined) next.renderKey = epoch;
      return next;
    };
    return blocks.map(visit);
  };

  const editor: GoTipeEditor = {
    get isDestroyed() {
      return destroyed;
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

    setEditable(next: boolean): void {
      if (next === editable) return;
      editable = next;
      if (mountedElement) {
        mountedElement.setAttribute("contenteditable", editable ? "true" : "false");
        mountedElement.setAttribute("aria-readonly", editable ? "false" : "true");
      }
      cachedViewState = null;
      this.emit("editableChange", editable);
      this.emit("viewStateChange", this.getViewState());
    },

    setDecorations(layer: string, decorations: Decoration[]): void {
      const prev = decorationLayers.get(layer);
      if (decorations.length === 0) {
        if (!prev) return;
        decorationLayers.delete(layer);
      } else {
        decorationLayers.set(layer, decorations.slice());
      }
      cachedViewState = null;
      this.emit("decorationsChange", { layer });
      this.emit("viewStateChange", this.getViewState());
    },

    getDecorations(layer?: string): Decoration[] {
      if (layer !== undefined) return (decorationLayers.get(layer) ?? EMPTY_DECORATIONS).slice();
      return allDecorations().slice();
    },

    reportError(error: GoTipeError): void {
      try {
        this.emit("error", error);
      } catch {
        // Listener errors must not mask the original error.
      }
      try {
        host.onError?.(error);
      } catch {
        // Host callback errors are ignored on purpose.
      }
      if (!host.onError && !listeners.get("error")?.size) {
        console.error(error);
      }
    },

    openLink(href: string, linkOptions?: { blockId?: string | null; newTab?: boolean }): void {
      const safe = toSafeHref(href);
      if (!safe) {
        this.reportError(new GoTipeError("LINK_BLOCKED", `Blocked link: ${href}`, { href }));
        return;
      }
      const info = { blockId: linkOptions?.blockId ?? null, newTab: linkOptions?.newTab ?? true };
      if (host.openLink) {
        try {
          host.openLink(safe, info);
        } catch (e) {
          this.reportError(
            new GoTipeError("LINK_OPEN_FAILED", e instanceof Error ? e.message : String(e), { href: safe }),
          );
        }
        return;
      }
      if (typeof window !== "undefined") {
        window.open(safe, "_blank", "noopener,noreferrer");
      }
    },

    getViewState(): ViewState {
      if (cachedViewState) return cachedViewState;

      const defaultSelection = {
        type: "text" as const,
        anchor: { blockId: "", offset: 0 },
        head: { blockId: "", offset: 0 },
      };
      const defaultToolbar = {
        activeMarks: [] as string[],
        activeBlockType: "paragraph",
        activeBlockAttrs: {} as Record<string, unknown>,
        canUndo: false,
        canRedo: false,
      };

      let parsed: Record<string, unknown> | null = null;
      try {
        const json = bridge.getState();
        if (json === lastStateJson && lastParsed) {
          parsed = lastParsed;
        } else {
          const raw = JSON.parse(json);
          // Convert from WASM format (block_type, content: {type: "RichText"}) to JS format
          parsed = fromWasmDoc(raw) as Record<string, unknown>;
          parsed.blocks = shareBlocks(
            (lastParsed?.blocks as ViewState["blocks"] | undefined) ?? [],
            (parsed.blocks as ViewState["blocks"]) ?? [],
          );
          lastStateJson = json;
          lastParsed = parsed;
        }
      } catch {
        // WASM getState failed — use initial content as fallback
        parsed = fallbackContent as Record<string, unknown>;
      }

      const blocks = attachDecorations((parsed?.blocks as ViewState["blocks"]) ?? []);
      // Prefer tracked DOM selection over WASM selection
      const sel = currentSelection.anchor.blockId
        ? currentSelection
        : (parsed?.selection as ViewState["selection"]) ?? defaultSelection;

      // Compute toolbar state from JS side (WASM doesn't track toolbar)
      const activeBlockId = sel.anchor.blockId;
      const currentBlock = activeBlockId ? findBlockInTree(blocks, activeBlockId) : null;
      const isCollapsed = sel.anchor.blockId === sel.head.blockId && sel.anchor.offset === sel.head.offset;

      let activeMarks: string[];
      if (storedMarks !== null) {
        activeMarks = storedMarks.map((m) => m.type);
      } else if (activeBlockId) {
        activeMarks = isCollapsed
          ? getMarksAt(blocks, activeBlockId, sel.anchor.offset).map((m) => m.type)
          : getMarksAt(blocks, activeBlockId, Math.min(sel.anchor.offset, sel.head.offset), false).map((m) => m.type);
      } else {
        activeMarks = [];
      }

      const toolbar: ViewState["toolbar"] = {
        activeMarks,
        activeBlockType: currentBlock?.type ?? "paragraph",
        activeBlockAttrs: (currentBlock?.attrs ?? {}) as Record<string, unknown>,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
      };

      cachedViewState = {
        blocks,
        selection: sel,
        decorations: allDecorations(),
        toolbar,
        version: (parsed?.version as number) ?? 1,
      };
      return cachedViewState;
    },

    getJSON(): object {
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
      const state = this.getViewState();
      return state.blocks
        .map((b) =>
          Array.isArray(b.content) ? b.content.map((s) => s.text).join("") : (b.content ?? ""),
        )
        .join("\n");
    },

    focus(position?: "start" | "end"): void {
      if (!mountedElement) return;

      const state = this.getViewState();
      if (state.blocks.length === 0) return;

      const textLength = (block: ViewState["blocks"][0]) =>
        Array.isArray(block.content)
          ? block.content.reduce((sum, span) => sum + span.text.length, 0)
          : typeof block.content === "string"
            ? block.content.length
            : 0;

      if (position === "start") {
        const first = state.blocks[0]!;
        currentSelection = {
          type: "text",
          anchor: { blockId: first.id, offset: 0 },
          head: { blockId: first.id, offset: 0 },
        };
      } else if (position === "end") {
        const last = state.blocks[state.blocks.length - 1]!;
        const end = textLength(last);
        currentSelection = {
          type: "text",
          anchor: { blockId: last.id, offset: end },
          head: { blockId: last.id, offset: end },
        };
      } else if (!currentSelection.anchor.blockId) {
        const first = state.blocks[0]!;
        currentSelection = {
          type: "text",
          anchor: { blockId: first.id, offset: 0 },
          head: { blockId: first.id, offset: 0 },
        };
      }

      mountedElement.focus({ preventScroll: true });
      restoreDomSelectionImmediately?.();
      scheduleDomSelectionRestore?.();
    },

    setSelection(selection): void {
      currentSelection = {
        type: "text",
        anchor: { ...selection.anchor },
        head: { ...selection.head },
      };
      cachedViewState = null;
      this.emit("selectionChange", { editor: this });
      this.emit("viewStateChange", this.getViewState());
      restoreDomSelectionImmediately?.();
      scheduleDomSelectionRestore?.();
    },

    syncSelectionFromDOM(): void {
      const selection = readSelectionFromDOM?.();
      if (!selection) return;
      currentSelection = {
        type: "text",
        anchor: { ...selection.anchor },
        head: { ...selection.head },
      };
      cachedViewState = null;
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

    chain(): ChainableCommands {
      return new ChainableCommands(this);
    },

    dispatch(transaction: object): void {
      if (destroyed) return;

      const tr = transaction as { steps: Record<string, unknown>[] };
      const steps = tr.steps ?? [];

      // Detect stored marks toggle: all steps are addMark/removeMark with from === to
      const isStoredMarkToggle =
        steps.length > 0 &&
        steps.every((step) => {
          const type = step.type as string;
          return (type === "addMark" || type === "removeMark") && step.from === step.to;
        });

      if (isStoredMarkToggle) {
        // Handle as stored marks toggle — no WASM dispatch needed
        const state = this.getViewState();
        for (const step of steps) {
          const type = step.type as string;
          if (type === "addMark") {
            const mark = step.mark as { type: string; attrs?: Record<string, unknown> };
            const currentMarks =
              storedMarks ??
              getMarksAt(state.blocks, currentSelection.anchor.blockId, currentSelection.anchor.offset);
            storedMarks = [
              ...currentMarks.filter((m) => m.type !== mark.type),
              { type: mark.type, attrs: mark.attrs ?? {} },
            ];
          } else if (type === "removeMark") {
            const markType = step.markType as string;
            const currentMarks =
              storedMarks ??
              getMarksAt(state.blocks, currentSelection.anchor.blockId, currentSelection.anchor.offset);
            storedMarks = currentMarks.filter((m) => m.type !== markType);
          }
        }
        cachedViewState = null;
        this.emit("update", { editor: this });
        this.emit("viewStateChange", this.getViewState());
        if (currentSelection.anchor.blockId) {
          scheduleDomSelectionRestore?.();
        }
        return;
      }

      try {
        // Snapshot current state for undo before applying
        const snapshot = bridge.getState();
        const wasmTr = toWasmTransaction(transaction as Record<string, unknown>);
        bridge.apply(JSON.stringify(wasmTr));

        undoStack.push(snapshot);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack.length = 0; // new mutation clears redo

        cachedViewState = null;
        this.emit("update", { editor: this });
        this.emit("viewStateChange", this.getViewState());
        if (currentSelection.anchor.blockId) {
          scheduleDomSelectionRestore?.();
        }
      } catch (e) {
        throw new GoTipeError(
          "TRANSFORM_ERROR",
          e instanceof Error ? e.message : "Transaction failed",
        );
      }
    },

    undo(): boolean {
      if (undoStack.length === 0) return false;
      const prev = undoStack.pop()!;
      redoStack.push(bridge.getState());
      bridge.restoreState(schemaJson, prev);
      cachedViewState = null;
      this.emit("update", { editor: this });
      this.emit("viewStateChange", this.getViewState());
      if (currentSelection.anchor.blockId) {
        scheduleDomSelectionRestore?.();
      }
      return true;
    },

    redo(): boolean {
      if (redoStack.length === 0) return false;
      const next = redoStack.pop()!;
      undoStack.push(bridge.getState());
      bridge.restoreState(schemaJson, next);
      cachedViewState = null;
      this.emit("update", { editor: this });
      this.emit("viewStateChange", this.getViewState());
      if (currentSelection.anchor.blockId) {
        scheduleDomSelectionRestore?.();
      }
      return true;
    },

    setContent(content: string | object, setOptions?: SetContentOptions): void {
      const json = typeof content === "string" ? { blocks: [], version: 1 } : content;
      const wasmJson = toWasmDoc(json as Record<string, unknown>);
      const previousState = setOptions?.addToHistory || setOptions?.preserveSelection
        ? bridge.getState()
        : null;
      const previousSelection = currentSelection;
      const hadFocus =
        !!mountedElement &&
        typeof document !== "undefined" &&
        !!document.activeElement &&
        mountedElement.contains(document.activeElement);
      bridge.create(schemaJson, JSON.stringify(wasmJson));
      cachedViewState = null;
      storedMarks = null;
      if (setOptions?.addToHistory && previousState) {
        undoStack.push(previousState);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack.length = 0;
      }

      try {
        const raw = JSON.parse(bridge.getState()) as Record<string, unknown>;
        const parsed = fromWasmDoc(raw) as Record<string, unknown>;
        const blocks = ((parsed.blocks as ViewState["blocks"]) ?? []) as ViewState["blocks"];
        const mapped =
          setOptions?.preserveSelection && previousState && previousSelection.anchor.blockId
            ? mapSelectionToDocument(
                previousSelection,
                fromWasmDoc(JSON.parse(previousState) as Record<string, unknown>).blocks as ViewState["blocks"],
                blocks,
              )
            : null;
        const first = mapped ? null : findFirstSelectableBlock(blocks);
        currentSelection = mapped
          ? mapped
          : first
          ? {
              type: "text",
              anchor: { blockId: first.id, offset: 0 },
              head: { blockId: first.id, offset: 0 },
            }
          : {
              type: "text",
              anchor: { blockId: "", offset: 0 },
              head: { blockId: "", offset: 0 },
            };
      } catch {
        currentSelection = {
          type: "text",
          anchor: { blockId: "", offset: 0 },
          head: { blockId: "", offset: 0 },
        };
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
      const json = typeof content === "string" ? content : JSON.stringify(content);
      return bridge.validate(json);
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
      const block = state.blocks.find((b) => b.id === blockId);
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
          (fn as (...a: unknown[]) => void)(...args);
        }
      }
    },

    mount(element: HTMLElement): void {
      if (mountedElement) this.unmount();
      mountedElement = element;
      mountAbort = new AbortController();
      const { signal } = mountAbort;
      element.setAttribute("contenteditable", editable ? "true" : "false");
      element.setAttribute("role", "textbox");
      element.setAttribute("aria-multiline", "true");
      element.setAttribute("data-gotipe-editor", "");

      clipboardHandler = new ClipboardHandler(this);

      element.setAttribute("aria-readonly", editable ? "false" : "true");
      element.addEventListener(
        "paste",
        (e) => {
          if (!editable) {
            e.preventDefault();
            return;
          }
          clipboardHandler?.onPaste(e);
        },
        { signal },
      );
      element.addEventListener("copy", (e) => clipboardHandler?.onCopy(e), { signal });
      element.addEventListener(
        "cut",
        (e) => {
          if (!editable) {
            e.preventDefault();
            return;
          }
          clipboardHandler?.onCut(e);
        },
        { signal },
      );
      element.addEventListener(
        "drop",
        (e) => {
          if (!editable) e.preventDefault();
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
        const wantsOpen = !editable || e.metaKey || e.ctrlKey || e.button === 1;
        if (!wantsOpen) return;
        const blockId = anchor.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null;
        this.openLink(anchor.getAttribute("href") ?? "", { blockId, newTab: true });
      };
      element.addEventListener("click", onLinkActivate, { signal });
      element.addEventListener("auxclick", onLinkActivate, { signal });
      element.addEventListener("focus", () => this.emit("focus", { editor: this }), { signal });
      element.addEventListener("blur", () => this.emit("blur", { editor: this }), { signal });

      // --- DOM selection → block/offset resolution ---
      const resolvePosition = (node: Node, offset: number): { blockId: string; offset: number } | null => {
        // If node is an element, resolve to the actual text position
        let resolvedNode = node;
        let resolvedOffset = offset;

        if (resolvedNode.nodeType === Node.ELEMENT_NODE) {
          const el = resolvedNode as HTMLElement;
          const childCount = el.childNodes.length;
          // offset is child index — navigate to the actual text node
          if (childCount > 0 && offset < childCount) {
            resolvedNode = el.childNodes[offset]!;
            resolvedOffset = 0;
          } else if (childCount > 0) {
            // Past last child — position at end of last text node
            const lastChild = el.childNodes[childCount - 1]!;
            if (lastChild.nodeType === Node.TEXT_NODE) {
              resolvedNode = lastChild;
              resolvedOffset = (lastChild.textContent ?? "").length;
            } else {
              resolvedNode = lastChild;
              resolvedOffset = 0;
            }
          }
        }

        // Walk up from the node to find the closest [data-block-id] element
        let blockEl: HTMLElement | null =
          resolvedNode instanceof HTMLElement ? resolvedNode : resolvedNode.parentElement;
        while (blockEl && !blockEl.hasAttribute("data-block-id")) {
          blockEl = blockEl.parentElement;
        }
        if (!blockEl) return null;

        const blockType = blockEl.getAttribute("data-block-type");
        if (blockType === "bulletList" || blockType === "orderedList" || blockType === "todoList") {
          const items = Array.from(
            blockEl.querySelectorAll(
              ':scope > [data-block-id][data-block-type="listItem"], :scope > [data-block-id][data-block-type="todoItem"]',
            ),
          ).filter((item): item is HTMLElement => item instanceof HTMLElement);

          if (items.length > 0) {
            let targetItem: HTMLElement | null = null;

            if (resolvedNode === blockEl) {
              const idx = Math.max(0, Math.min(items.length - 1, Math.max(0, resolvedOffset - 1)));
              targetItem = items[idx] ?? items[0]!;
            } else {
              const sourceEl = resolvedNode instanceof Element ? resolvedNode : resolvedNode.parentElement;
              const owner = sourceEl?.closest(
                '[data-block-id][data-block-type="listItem"], [data-block-id][data-block-type="todoItem"]',
              );
              if (owner instanceof HTMLElement && blockEl.contains(owner)) {
                targetItem = owner;
              }
            }

            blockEl = targetItem ?? items[0]!;
          }
        }

        const blockId = blockEl.getAttribute("data-block-id")!;
        const textHost =
          blockType === "callout"
            ? (blockEl.querySelector(".gotipe-callout-content") as HTMLElement | null) ?? blockEl
            : blockEl;

        if (blockType === "callout") {
          const anchorElement =
            resolvedNode instanceof Element ? resolvedNode : resolvedNode.parentElement;
          if (anchorElement && !textHost.contains(anchorElement)) {
            return { blockId, offset: 0 };
          }
        }

        // Calculate text offset within this block by walking the text nodes
        let textOffset = 0;
        const walker = createTextWalker(textHost);
        let textNode: Node | null;
        while ((textNode = walker.nextNode())) {
          if (textNode === resolvedNode) {
            textOffset += resolvedOffset;
            break;
          }
          if (resolvedNode.nodeType !== Node.TEXT_NODE && resolvedNode.contains(textNode)) {
            // resolvedNode is an element containing this text node
            textOffset += resolvedOffset;
            break;
          }
          // The point sits before this text node (e.g. inside or before a
          // widget, whose text the walker skips): stop counting here.
          if (
            resolvedNode.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_FOLLOWING &&
            !resolvedNode.contains(textNode)
          ) {
            break;
          }
          textOffset += (textNode.textContent ?? "").length;
        }
        return { blockId, offset: textOffset };
      };

      // Restore DOM selection to match currentSelection after React re-render
      let pendingSelectionRestore = false;
      const resolveDomPoint = (blockId: string, targetOffset: number): { node: Node; offset: number } | null => {
        if (!mountedElement) return null;
        const blockEl = mountedElement.querySelector(
          `[data-block-id="${blockId}"]`,
        );
        if (!blockEl) return null;

        const blockType = blockEl.getAttribute("data-block-type");
        if (blockType === "bulletList" || blockType === "orderedList" || blockType === "todoList") {
          const firstItem = blockEl.querySelector(
            ':scope > [data-block-id][data-block-type="listItem"], :scope > [data-block-id][data-block-type="todoItem"]',
          );
          if (firstItem instanceof HTMLElement) {
            const firstItemId = firstItem.getAttribute("data-block-id");
            if (firstItemId) {
              return resolveDomPoint(firstItemId, targetOffset);
            }
          }
        }

        const textHost =
          blockType === "callout"
            ? (blockEl.querySelector(".gotipe-callout-content") as HTMLElement | null) ?? blockEl
            : blockEl;
        const walker = createTextWalker(textHost);
        let accumulated = 0;
        let textNode: Node | null;
        let lastTextNode: Node | null = null;

        while ((textNode = walker.nextNode())) {
          lastTextNode = textNode;
          const len = (textNode.textContent ?? "").length;
          if (accumulated + len >= targetOffset) {
            const localOffset = targetOffset - accumulated;
            return { node: textNode, offset: Math.min(localOffset, len) };
          }
          accumulated += len;
        }

        // Empty block (or no text nodes yet):
        // for todo items, place caret in the text content area after checkbox.
        if (!lastTextNode) {
          if (blockType === "todoItem") {
            const contentHost = blockEl.querySelector("[data-gotipe-todo-content]");
            if (contentHost) return { node: contentHost, offset: 0 };
          }
          if (blockType === "callout" && textHost !== blockEl) {
            return { node: textHost, offset: 0 };
          }
          return { node: blockEl, offset: 0 };
        }

        const lastLen = (lastTextNode.textContent ?? "").length;
        return { node: lastTextNode, offset: lastLen };
      };

      const restoreDomSelection = (): boolean => {
        if (!mountedElement) return false;

        const anchorPoint = resolveDomPoint(currentSelection.anchor.blockId, currentSelection.anchor.offset);
        const headPoint = resolveDomPoint(currentSelection.head.blockId, currentSelection.head.offset);
        if (!anchorPoint || !headPoint) return false;

        const sel = document.getSelection();
        if (!sel) return false;

        try {
          sel.removeAllRanges();

          if (typeof sel.setBaseAndExtent === "function") {
            sel.setBaseAndExtent(
              anchorPoint.node,
              anchorPoint.offset,
              headPoint.node,
              headPoint.offset,
            );
            return true;
          }

          const range = document.createRange();
          range.setStart(anchorPoint.node, anchorPoint.offset);
          range.setEnd(headPoint.node, headPoint.offset);
          sel.addRange(range);
          return true;
        } catch {
          return false;
        }
      };
      restoreDomSelectionImmediately = restoreDomSelection;

      // Correct DOM text nodes if native input leaked through preventDefault()
      const correctDomFromWasmState = (): boolean => {
        if (!mountedElement) return false;
        const state = this.getViewState();
        const stale: string[] = [];
        const collectOwnTextNodes = (host: HTMLElement, ownerBlockId: string): Text[] => {
          const walker = createTextWalker(host);
          const textNodes: Text[] = [];
          let node: Node | null;
          while ((node = walker.nextNode())) {
            const parent = node.parentElement;
            const owner = parent?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? ownerBlockId;
            if (owner === ownerBlockId) {
              textNodes.push(node as Text);
            }
          }
          return textNodes;
        };

        for (const block of flattenBlocks(state.blocks)) {
          if (!Array.isArray(block.content)) continue;
          const blockEl = mountedElement.querySelector(
            `[data-block-id="${block.id}"]`,
          );
          if (!blockEl) continue;

          const blockType = blockEl.getAttribute("data-block-type");
          const textHost =
            blockType === "todoItem"
              ? (blockEl.querySelector("[data-gotipe-todo-content]") as HTMLElement | null) ?? blockEl
              : blockType === "callout"
                ? (blockEl.querySelector(".gotipe-callout-content") as HTMLElement | null) ?? blockEl
                : blockEl;

          const expected = block.content.map((s) => s.text).join("");
          const textNodes = collectOwnTextNodes(textHost as HTMLElement, block.id);
          const actual = textNodes.map((node) => node.nodeValue ?? "").join("");
          if (actual !== expected) {
            // The browser inserted nodes the renderer does not own. Patching
            // text nodes in place cannot be trusted (decorations split spans,
            // native nodes sit next to rendered ones), so ask the renderer to
            // remount this block from the model.
            stale.push(block.id);
          }
        }
        if (stale.length > 0) {
          for (const id of stale) renderEpochs.set(id, (renderEpochs.get(id) ?? 0) + 1);
          cachedViewState = null;
          this.emit("viewStateChange", this.getViewState());
          return true;
        }
        return false;
      };

      // Schedule selection restore after React re-render
      const scheduleSelectionRestore = () => {
        if (pendingSelectionRestore) return;
        pendingSelectionRestore = true;
        let attempts = 0;

        const tryRestore = () => {
          attempts += 1;

          // Fix DOM if native input leaked through preventDefault()
          if (inputHandledByWasm) {
            inputHandledByWasm = false;
            if (correctDomFromWasmState() && attempts < 4) {
              // The renderer remounts the stale blocks; restore on next frame.
              requestAnimationFrame(tryRestore);
              return;
            }
          }

          const restored = restoreDomSelection();
          if (!restored && attempts < 4) {
            requestAnimationFrame(tryRestore);
            return;
          }

          pendingSelectionRestore = false;
        };

        requestAnimationFrame(tryRestore);
      };
      scheduleDomSelectionRestore = scheduleSelectionRestore;

      const publishSelection = () => {
        cachedViewState = null;
        this.emit("selectionChange", { editor: this });
        this.emit("viewStateChange", this.getViewState());
      };

      // Ignore only a handful of programmatic selectionchange events,
      // but never suppress real user caret moves with time-based locks.
      let ignoredSelectionEvents = 0;
      const beginSelectionChangeLock = (events = 3) => {
        ignoredSelectionEvents = Math.max(ignoredSelectionEvents, events);
      };
      const clearSelectionChangeLock = () => {
        ignoredSelectionEvents = 0;
      };
      readSelectionFromDOM = () => {
        const sel = document.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const anchorNode = sel.anchorNode;
        const focusNode = sel.focusNode;
        if (!anchorNode || !focusNode) return null;
        if (!element.contains(anchorNode) || !element.contains(focusNode)) return null;

        const anchor = resolvePosition(anchorNode, sel.anchorOffset);
        const head = resolvePosition(focusNode, sel.focusOffset);
        if (!anchor || !head) return null;

        return {
          anchor: { blockId: anchor.blockId, offset: anchor.offset },
          head: { blockId: head.blockId, offset: head.offset },
        };
      };

      const shouldNormalizeCollapsedTodoCaret = (sel: Selection | null): boolean => {
        if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false;
        const anchorNode = sel.anchorNode;
        if (!anchorNode || !element.contains(anchorNode)) return false;

        const anchorEl = anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
        const todoItem = anchorEl?.closest('[data-block-type="todoItem"]') as HTMLElement | null;
        if (!todoItem) return false;

        const textHost = todoItem.querySelector("[data-gotipe-todo-content]");
        if (!(textHost instanceof HTMLElement)) return false;

        if (textHost === anchorNode || textHost.contains(anchorEl ?? null)) {
          return false;
        }

        if (anchorNode === todoItem && sel.anchorOffset <= 1) {
          return true;
        }

        const checkbox = todoItem.querySelector('input[type="checkbox"]');
        if (checkbox && (checkbox === anchorNode || checkbox.contains(anchorEl ?? null))) {
          return true;
        }

        return true;
      };

      const onSelectionChange = () => {
        if (pendingSelectionRestore) return;
        if (composingBlockId !== null) return;
        const domSelection = document.getSelection();
        const normalizeTodoCaret = shouldNormalizeCollapsedTodoCaret(domSelection);
        if (ignoredSelectionEvents > 0) {
          if (!normalizeTodoCaret) {
            ignoredSelectionEvents -= 1;
            return;
          }
          ignoredSelectionEvents -= 1;
        }
        const selection = readSelectionFromDOM?.();
        if (!selection) return;
        const prevSelection = currentSelection;
        const sameSelection =
          prevSelection.anchor.blockId === selection.anchor.blockId &&
          prevSelection.anchor.offset === selection.anchor.offset &&
          prevSelection.head.blockId === selection.head.blockId &&
          prevSelection.head.offset === selection.head.offset;

        currentSelection = {
          type: "text" as const,
          anchor: { ...selection.anchor },
          head: { ...selection.head },
        };
        if (!sameSelection) {
          storedMarks = null;
        }
        publishSelection();

        if (normalizeTodoCaret) {
          beginSelectionChangeLock(2);
          const restoredNow = restoreDomSelectionImmediately?.() ?? false;
          if (!restoredNow) {
            scheduleSelectionRestore();
          }
        }
      };
      document.addEventListener("selectionchange", onSelectionChange, { signal });

      // --- Native input leak protection ---
      // Some environments (headless browsers, certain IME) ignore
      // beforeinput.preventDefault(). Track whether we handled the input
      // via WASM so we can correct the DOM in the `input` event if the
      // native mutation leaked through.
      let inputHandledByWasm = false;
      let pendingEnterMode: "plain" | "shift" | null = null;
      let composingBlockId: string | null = null;

      // --- IME composition ---
      // During a composition the browser owns the DOM (insertCompositionText is
      // not cancelable). On compositionend the block text in the DOM is
      // compared with the model and the difference is applied as one
      // transaction, so dead keys, accent menus and CJK input all work.
      const textHostOf = (blockEl: Element): Element => {
        const blockType = blockEl.getAttribute("data-block-type");
        if (blockType === "todoItem") return blockEl.querySelector("[data-gotipe-todo-content]") ?? blockEl;
        if (blockType === "callout") return blockEl.querySelector(".gotipe-callout-content") ?? blockEl;
        return blockEl;
      };
      const ownDomText = (blockEl: Element, blockId: string): string => {
        const walker = createTextWalker(textHostOf(blockEl));
        let text = "";
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const owner = node.parentElement?.closest("[data-block-id]")?.getAttribute("data-block-id");
          if (!owner || owner === blockId) text += node.nodeValue ?? "";
        }
        return text;
      };
      element.addEventListener(
        "compositionstart",
        () => {
          if (!editable) return;
          const sel = readSelectionFromDOM?.() ?? currentSelection;
          if (!sel?.anchor.blockId) return;
          composingBlockId = sel.anchor.blockId;
        },
        { signal },
      );
      element.addEventListener(
        "compositionend",
        (e) => {
          const blockId = composingBlockId;
          composingBlockId = null;
          if (!blockId || !editable || !mountedElement) return;
          const blockEl = mountedElement.querySelector(`[data-block-id="${blockId}"]`);
          const block = findBlockInTree(this.getViewState().blocks, blockId);
          if (!blockEl || !block) return;
          const model = Array.isArray(block.content)
            ? block.content.map((sp) => sp.text).join("")
            : typeof block.content === "string"
              ? block.content
              : "";
          const dom = ownDomText(blockEl, blockId);
          let prefix = 0;
          const maxPrefix = Math.min(model.length, dom.length);
          while (prefix < maxPrefix && model.charCodeAt(prefix) === dom.charCodeAt(prefix)) prefix++;
          let suffix = 0;
          const maxSuffix = Math.min(model.length, dom.length) - prefix;
          while (
            suffix < maxSuffix &&
            model.charCodeAt(model.length - 1 - suffix) === dom.charCodeAt(dom.length - 1 - suffix)
          ) {
            suffix++;
          }
          const removeTo = model.length - suffix;
          let inserted = dom.slice(prefix, dom.length - suffix);
          let at = prefix;
          let removeFrom = prefix;
          let removeEnd = removeTo;
          if (inserted === "" && removeFrom === removeEnd) {
            // DOM unchanged (the browser cancelled the native insertion):
            // fall back to the committed string at the caret.
            if (!e.data) return;
            const sel = readSelectionFromDOM?.() ?? currentSelection;
            if (sel.anchor.blockId !== blockId) return;
            at = Math.min(sel.anchor.offset, sel.head.offset);
            removeFrom = at;
            removeEnd = Math.max(sel.anchor.offset, sel.head.offset);
            inserted = e.data;
          }
          const steps: unknown[] = [];
          if (removeEnd > removeFrom) {
            steps.push(
              block.type === "codeBlock"
                ? { type: "deleteRange", blockId, from: removeFrom, to: removeEnd }
                : { type: "deleteText", blockId, from: removeFrom, to: removeEnd },
            );
          }
          if (inserted) {
            const marks = storedMarks ?? getMarksAt(this.getViewState().blocks, blockId, at);
            steps.push({ type: "insertText", blockId, offset: at, text: inserted, marks });
          }
          if (steps.length === 0) return;
          try {
            beginSelectionChangeLock();
            inputHandledByWasm = true;
            this.dispatch({ steps });
            storedMarks = null;
            const caret = at + inserted.length;
            currentSelection = {
              type: "text",
              anchor: { blockId, offset: caret },
              head: { blockId, offset: caret },
            };
            publishSelection();
            scheduleSelectionRestore();
          } catch (err) {
            clearSelectionChangeLock();
            this.reportError(
              new GoTipeError("TRANSFORM_ERROR", err instanceof Error ? err.message : "Composition failed"),
            );
          }
        },
        { signal },
      );

      // --- beforeinput: capture text editing intent ---
      element.addEventListener("beforeinput", (e) => {
        if (!editable) {
          e.preventDefault();
          return;
        }
        const inputType = e.inputType;
        if (
          composingBlockId !== null &&
          (inputType === "insertCompositionText" ||
            inputType === "deleteCompositionText" ||
            inputType === "insertFromComposition")
        ) {
          // Let the browser render the composition; compositionend commits it.
          return;
        }
        const enterMode = pendingEnterMode;
        if (inputType === "insertParagraph" || inputType === "insertLineBreak") {
          pendingEnterMode = null;
        }
        const resolveSelectionForInput = () => {
          if (!pendingSelectionRestore) {
            const domSelection = readSelectionFromDOM?.();
            if (domSelection?.anchor.blockId) {
              currentSelection = {
                type: "text",
                anchor: { ...domSelection.anchor },
                head: { ...domSelection.head },
              };
            }
          }
          return currentSelection;
        };

        let lineBreakActsAsParagraph = false;
        if (inputType === "insertLineBreak") {
          const probePos = resolveSelectionForInput();
          const probeBlock = probePos?.anchor.blockId
            ? findBlockInTree(this.getViewState().blocks, probePos.anchor.blockId)
            : null;
          const isShiftLineBreak = enterMode === "shift";
          lineBreakActsAsParagraph = !isShiftLineBreak && probeBlock?.type !== "codeBlock";
        }

        if (
          inputType === "insertText" ||
          inputType === "insertCompositionText" ||
          (inputType === "insertLineBreak" && !lineBreakActsAsParagraph)
        ) {
          const data = inputType === "insertLineBreak" ? "\n" : e.data;
          if (!data) return;
          e.preventDefault();

          const pos = resolveSelectionForInput();
          if (!pos?.anchor.blockId) return;

          const steps: unknown[] = [];
          let newOffset: number;

          // Compute marks for new text: stored marks > position-based detection
          const state = this.getViewState();
          const isRange = pos.anchor.blockId === pos.head.blockId && pos.anchor.offset !== pos.head.offset;
          let marksForInsert: { type: string; attrs: Record<string, unknown> }[];
          if (storedMarks !== null) {
            marksForInsert = storedMarks;
          } else if (isRange) {
            // Replacing selection: inherit marks from first selected character
            const selStart = Math.min(pos.anchor.offset, pos.head.offset);
            marksForInsert = getMarksAt(state.blocks, pos.anchor.blockId, selStart, false);
          } else {
            // Collapsed cursor: prefer current active marks (includes stored/toggled marks)
            // and keep parity with common editors for typing in the middle/end of text.
            marksForInsert = (state.toolbar.activeMarks ?? []).map((type) => ({ type, attrs: {} }));
          }

          // Delete selected text first if selection is a range
          if (isRange) {
            const from = Math.min(pos.anchor.offset, pos.head.offset);
            const to = Math.max(pos.anchor.offset, pos.head.offset);
            steps.push({ type: "deleteText", blockId: pos.anchor.blockId, from, to });
            steps.push({
              type: "insertText",
              blockId: pos.anchor.blockId,
              offset: from,
              text: data,
              marks: marksForInsert,
            });
            newOffset = from + data.length;
          } else {
            steps.push({
              type: "insertText",
              blockId: pos.anchor.blockId,
              offset: pos.anchor.offset,
              text: data,
              marks: marksForInsert,
            });
            newOffset = pos.anchor.offset + data.length;
          }

          const runInputRules = (blockId: string, caretOffset: number) => {
            const ruleState = this.getViewState();
            const ruleBlock = findBlockInTree(ruleState.blocks, blockId);
            if (!ruleBlock || !Array.isArray(ruleBlock.content)) return;
            const ruleText = ruleBlock.content.map((s: { text: string }) => s.text).join("");
            for (const ext of resolved) {
              if (ext.inputRules) {
                for (const rule of ext.inputRules) {
                  const match = ruleText.match(rule.pattern);
                  if (match) {
                    rule.handler(this, match);
                    return;
                  }
                }
              }
            }

            // Slash menu trigger should also work at caret in non-empty blocks
            // (e.g. typing "/" at the start of an existing line).
            if (data === "/") {
              const safeOffset = Math.max(0, Math.min(caretOffset, ruleText.length));
              const beforeCaret = ruleText.slice(0, safeOffset);
              const slashIdx = beforeCaret.lastIndexOf("/");
              if (slashIdx !== -1) {
                const prevChar = slashIdx > 0 ? beforeCaret[slashIdx - 1] ?? "" : "";
                const query = beforeCaret.slice(slashIdx + 1);
                if ((slashIdx === 0 || /\s/.test(prevChar)) && !/\s/.test(query)) {
                  this.emit("openSlashMenu");
                }
              }
            }
          };

          try {
            beginSelectionChangeLock();
            inputHandledByWasm = true;
            this.dispatch({ steps });
            // Clear stored marks after insertion (position-based detection takes over)
            storedMarks = null;
            // Advance cursor position
            currentSelection = {
              type: "text",
              anchor: { blockId: pos.anchor.blockId, offset: newOffset },
              head: { blockId: pos.anchor.blockId, offset: newOffset },
            };
            publishSelection();
            scheduleSelectionRestore();
            runInputRules(pos.anchor.blockId, newOffset);
          } catch {
            clearSelectionChangeLock();
            const fallbackSel = readSelectionFromDOM?.();
            if (!fallbackSel?.anchor.blockId) return;

            const fallbackPos = {
              anchor: fallbackSel.anchor,
              head: fallbackSel.head,
            };
            const fallbackState = this.getViewState();
            const fallbackIsRange =
              fallbackPos.anchor.blockId === fallbackPos.head.blockId &&
              fallbackPos.anchor.offset !== fallbackPos.head.offset;
            const fallbackMarks =
              storedMarks !== null
                ? storedMarks
                : fallbackIsRange
                  ? getMarksAt(
                      fallbackState.blocks,
                      fallbackPos.anchor.blockId,
                      Math.min(fallbackPos.anchor.offset, fallbackPos.head.offset),
                      false,
                    )
                  : (fallbackState.toolbar.activeMarks ?? []).map((type) => ({
                      type,
                      attrs: {},
                    }));

            const fallbackSteps: unknown[] = [];
            let fallbackOffset: number;
            if (fallbackIsRange) {
              const from = Math.min(fallbackPos.anchor.offset, fallbackPos.head.offset);
              const to = Math.max(fallbackPos.anchor.offset, fallbackPos.head.offset);
              fallbackSteps.push({ type: "deleteText", blockId: fallbackPos.anchor.blockId, from, to });
              fallbackSteps.push({
                type: "insertText",
                blockId: fallbackPos.anchor.blockId,
                offset: from,
                text: data,
                marks: fallbackMarks,
              });
              fallbackOffset = from + data.length;
            } else {
              fallbackSteps.push({
                type: "insertText",
                blockId: fallbackPos.anchor.blockId,
                offset: fallbackPos.anchor.offset,
                text: data,
                marks: fallbackMarks,
              });
              fallbackOffset = fallbackPos.anchor.offset + data.length;
            }

            try {
              beginSelectionChangeLock();
              inputHandledByWasm = true;
              this.dispatch({ steps: fallbackSteps });
              storedMarks = null;
              currentSelection = {
                type: "text",
                anchor: { blockId: fallbackPos.anchor.blockId, offset: fallbackOffset },
                head: { blockId: fallbackPos.anchor.blockId, offset: fallbackOffset },
              };
              publishSelection();
              scheduleSelectionRestore();
              runInputRules(fallbackPos.anchor.blockId, fallbackOffset);
            } catch {
              clearSelectionChangeLock();
            }
          }
          return;
        }

        if (inputType === "insertParagraph" || lineBreakActsAsParagraph) {
          e.preventDefault();
          const pos = resolveSelectionForInput();
          if (!pos?.anchor.blockId) return;

          const preState = this.getViewState();
          const currentBlock = findBlockInTree(preState.blocks, pos.anchor.blockId);
          const shouldExitStyleOnEnter =
            !!currentBlock && ENTER_EXITS_TO_PARAGRAPH_TYPES.has(currentBlock.type);

          // Table cells never split: Enter moves to the cell below (or stays).
          if (currentBlock?.type === "tableCell" || currentBlock?.type === "tableHeader") {
            const row = findParentBlock(preState.blocks, currentBlock.id);
            const table = row ? findParentBlock(preState.blocks, row.parent.id) : null;
            const below = table?.parent.children[(table?.index ?? -1) + 1]?.children[row?.index ?? -1];
            if (below) {
              currentSelection = {
                type: "text",
                anchor: { blockId: below.id, offset: 0 },
                head: { blockId: below.id, offset: 0 },
              };
              publishSelection();
              scheduleSelectionRestore();
            }
            return;
          }

          // In code blocks Enter should insert a newline inside the same block,
          // not split into a second code block.
          if (currentBlock?.type === "codeBlock") {
            const isRange =
              pos.anchor.blockId === pos.head.blockId && pos.anchor.offset !== pos.head.offset;
            const steps: unknown[] = [];
            let newOffset: number;

            if (isRange) {
              const from = Math.min(pos.anchor.offset, pos.head.offset);
              const to = Math.max(pos.anchor.offset, pos.head.offset);
              steps.push({ type: "deleteText", blockId: pos.anchor.blockId, from, to });
              steps.push({
                type: "insertText",
                blockId: pos.anchor.blockId,
                offset: from,
                text: "\n",
                marks: [],
              });
              newOffset = from + 1;
            } else {
              steps.push({
                type: "insertText",
                blockId: pos.anchor.blockId,
                offset: pos.anchor.offset,
                text: "\n",
                marks: [],
              });
              newOffset = pos.anchor.offset + 1;
            }

            try {
              beginSelectionChangeLock();
              inputHandledByWasm = true;
              this.dispatch({ steps });
              currentSelection = {
                type: "text",
                anchor: { blockId: pos.anchor.blockId, offset: newOffset },
                head: { blockId: pos.anchor.blockId, offset: newOffset },
              };
              publishSelection();
              scheduleSelectionRestore();
            } catch {
              clearSelectionChangeLock();
            }
            return;
          }

          // Check if current block is an empty listItem → exit the list
          if (
            currentBlock &&
            (currentBlock.type === "listItem" || currentBlock.type === "todoItem") &&
            isBlockEmpty(currentBlock)
          ) {
            // Find parent list and unwrap this empty item
            const parentInfo = findParentBlock(preState.blocks, pos.anchor.blockId);
            if (parentInfo) {
              const listBlock = parentInfo.parent;
              const listLoc = findBlockLocation(preState.blocks, listBlock.id);
              if (listLoc) {
                try {
                  beginSelectionChangeLock();
                  inputHandledByWasm = true;

                  if (listBlock.children.length === 1) {
                    // Only item in list → replace list with empty paragraph
                    const newId = crypto.randomUUID();
                    this.dispatch({
                      steps: [
                        { type: "deleteBlock", blockId: listBlock.id },
                        {
                          type: "insertBlock",
                          parentId: listLoc.parentId,
                          index: listLoc.index,
                          block: { id: newId, type: "paragraph", attrs: {}, content: [], children: [] },
                        },
                      ],
                    });
                    currentSelection = {
                      type: "text" as const,
                      anchor: { blockId: newId, offset: 0 },
                      head: { blockId: newId, offset: 0 },
                    };
                  } else {
                    // Multiple items → remove this item and insert paragraph after list
                    const newId = crypto.randomUUID();
                    this.dispatch({
                      steps: [
                        { type: "deleteBlock", blockId: pos.anchor.blockId },
                        {
                          type: "insertBlock",
                          parentId: listLoc.parentId,
                          index: listLoc.index + 1,
                          block: { id: newId, type: "paragraph", attrs: {}, content: [], children: [] },
                        },
                      ],
                    });
                    currentSelection = {
                      type: "text" as const,
                      anchor: { blockId: newId, offset: 0 },
                      head: { blockId: newId, offset: 0 },
                    };
                  }
                  publishSelection();
                  scheduleSelectionRestore();
                } catch {
                  clearSelectionChangeLock();
                }
                return;
              }
            }
          }

          try {
            beginSelectionChangeLock();
            inputHandledByWasm = true;
            this.dispatch({
              steps: [{ type: "splitBlock", blockId: pos.anchor.blockId, offset: pos.anchor.offset }],
            });
            let state = this.getViewState();
            const loc = findBlockAndSibling(state.blocks, pos.anchor.blockId);
            if (loc && shouldExitStyleOnEnter) {
              const inserted = findBlockInTree(state.blocks, loc.id);
              if (inserted && inserted.type !== "paragraph") {
                this.dispatch({
                  steps: [{ type: "setBlockType", blockId: loc.id, newType: "paragraph", attrs: {} }],
                });
                state = this.getViewState();
              }
            }
            if (loc) {
              currentSelection = {
                type: "text",
                anchor: { blockId: loc.id, offset: 0 },
                head: { blockId: loc.id, offset: 0 },
              };
            }
            publishSelection();
            scheduleSelectionRestore();
          } catch {
            clearSelectionChangeLock();
          }
          return;
        }

        if (
          inputType === "deleteContentBackward" ||
          inputType === "deleteWordBackward" ||
          inputType === "deleteSoftLineBackward" ||
          inputType === "deleteHardLineBackward"
        ) {
          e.preventDefault();
          const pos = resolveSelectionForInput();
          if (!pos?.anchor.blockId) return;

          const steps: unknown[] = [];
          let newBlockId = pos.anchor.blockId;
          let newOffset = pos.anchor.offset;

          if (pos.anchor.blockId === pos.head.blockId && pos.anchor.offset !== pos.head.offset) {
            const from = Math.min(pos.anchor.offset, pos.head.offset);
            const to = Math.max(pos.anchor.offset, pos.head.offset);
            steps.push({ type: "deleteText", blockId: pos.anchor.blockId, from, to });
            newOffset = from;
          } else if (pos.anchor.offset > 0) {
            steps.push({
              type: "deleteText",
              blockId: pos.anchor.blockId,
              from: pos.anchor.offset - 1,
              to: pos.anchor.offset,
            });
            newOffset = pos.anchor.offset - 1;
          } else {
            // At start of block — merge with previous
            const state = this.getViewState();
            const currentBlock = findBlockInTree(state.blocks, pos.anchor.blockId);
            const parentInfo = currentBlock ? findParentBlock(state.blocks, pos.anchor.blockId) : null;
            const insideListItem =
              !!currentBlock &&
              (currentBlock.type === "listItem" || currentBlock.type === "todoItem") &&
              !!parentInfo &&
              (
                parentInfo.parent.type === "bulletList" ||
                parentInfo.parent.type === "orderedList" ||
                parentInfo.parent.type === "todoList"
              );

            // Notion-like behavior: Backspace at start of a non-empty list item
            // lifts it out of the list to a paragraph instead of no-op.
            if (insideListItem && !isBlockEmpty(currentBlock)) {
              try {
                beginSelectionChangeLock();
                inputHandledByWasm = true;
                const converted = this.chain().setBlockType("paragraph").run();
                if (converted) {
                  const nextSelection = this.getViewState().selection;
                  currentSelection = {
                    type: "text",
                    anchor: { blockId: nextSelection.anchor.blockId, offset: nextSelection.anchor.offset },
                    head: { blockId: nextSelection.head.blockId, offset: nextSelection.head.offset },
                  };
                  publishSelection();
                  scheduleSelectionRestore();
                  return;
                }
              } catch {
                // Fall through to regular merge path.
              }
              clearSelectionChangeLock();
            }

            const prevInfo = findBlockAndPreviousSibling(state.blocks, pos.anchor.blockId);
            const prevBlock = prevInfo ? findBlockInTree(state.blocks, prevInfo.id) : null;
            if (prevBlock) {
              const prevLen = Array.isArray(prevBlock.content)
                ? prevBlock.content.reduce((sum, s) => sum + s.text.length, 0)
                : typeof prevBlock.content === "string"
                  ? prevBlock.content.length
                  : 0;
              const isListMerge =
                !!currentBlock &&
                (currentBlock.type === "listItem" || currentBlock.type === "todoItem") &&
                (prevBlock.type === "listItem" || prevBlock.type === "todoItem");

              if (isListMerge) {
                const currentText = Array.isArray(currentBlock.content)
                  ? currentBlock.content.map((s) => s.text).join("")
                  : typeof currentBlock.content === "string"
                    ? currentBlock.content
                    : "";

                if (currentText.length > 0) {
                  steps.push({
                    type: "insertText",
                    blockId: prevBlock.id,
                    offset: prevLen,
                    text: currentText,
                    marks: [],
                  });
                }
                for (let i = 0; i < currentBlock.children.length; i++) {
                  steps.push({
                    type: "moveBlock",
                    blockId: currentBlock.children[i]!.id,
                    newParentId: prevBlock.id,
                    newIndex: prevBlock.children.length + i,
                  });
                }
                steps.push({ type: "deleteBlock", blockId: pos.anchor.blockId });
                newBlockId = prevBlock.id;
                newOffset = prevLen + currentText.length;
              } else {
                steps.push({
                  type: "mergeBlocks",
                  blockId: pos.anchor.blockId,
                  targetId: prevBlock.id,
                });
                newBlockId = prevBlock.id;
                newOffset = prevLen;
              }
            }
          }
          if (steps.length > 0) {
            try {
              beginSelectionChangeLock();
              inputHandledByWasm = true;
              this.dispatch({ steps });
              currentSelection = {
                type: "text",
                anchor: { blockId: newBlockId, offset: newOffset },
                head: { blockId: newBlockId, offset: newOffset },
              };
              publishSelection();
              scheduleSelectionRestore();
            } catch {
              clearSelectionChangeLock();
            }
          }
          return;
        }

        if (inputType === "deleteContentForward") {
          e.preventDefault();
          const pos = resolveSelectionForInput();
          if (!pos?.anchor.blockId) return;

          const state = this.getViewState();
          const block = findBlockInTree(state.blocks, pos.anchor.blockId);
          if (!block) return;
          const blockTextLen = Array.isArray(block.content)
            ? block.content.reduce((sum, s) => sum + s.text.length, 0)
            : typeof block.content === "string"
              ? block.content.length
              : 0;

          try {
            beginSelectionChangeLock();
            inputHandledByWasm = true;
            if (pos.anchor.blockId === pos.head.blockId && pos.anchor.offset !== pos.head.offset) {
              const from = Math.min(pos.anchor.offset, pos.head.offset);
              const to = Math.max(pos.anchor.offset, pos.head.offset);
              this.dispatch({ steps: [{ type: "deleteText", blockId: pos.anchor.blockId, from, to }] });
              currentSelection = {
                type: "text",
                anchor: { blockId: pos.anchor.blockId, offset: from },
                head: { blockId: pos.anchor.blockId, offset: from },
              };
              publishSelection();
            } else if (pos.anchor.offset < blockTextLen) {
              this.dispatch({
                steps: [{
                  type: "deleteText",
                  blockId: pos.anchor.blockId,
                  from: pos.anchor.offset,
                  to: pos.anchor.offset + 1,
                }],
              });
              // Cursor stays at same position after forward delete
            }
            scheduleSelectionRestore();
          } catch {
            clearSelectionChangeLock();
          }
          return;
        }
      }, { signal });

      // Keyboard shortcuts from extensions
      element.addEventListener("keydown", (e) => {
        if (e.isComposing || composingBlockId !== null || e.keyCode === 229) return;
        if (!editable) {
          // Read-only: allow navigation and copy, block editing shortcuts.
          return;
        }
        if (e.key === "Enter") {
          pendingEnterMode = e.shiftKey ? "shift" : "plain";
        }

        const isPasteShortcut =
          (e.metaKey || e.ctrlKey) &&
          !e.altKey &&
          !e.shiftKey &&
          e.key.toLowerCase() === "v";
        if (isPasteShortcut) {
          const selection = document.getSelection();
          const selectionAnchor = selection?.anchorNode ?? null;
          const eventTarget = e.target instanceof Node ? e.target : null;
          const inEditor =
            (selectionAnchor ? element.contains(selectionAnchor) : false) ||
            (eventTarget ? element.contains(eventTarget) : false);
          if (inEditor) {
            const domSelection = readSelectionFromDOM?.();
            if (domSelection?.anchor.blockId) {
              currentSelection = {
                type: "text",
                anchor: { ...domSelection.anchor },
                head: { ...domSelection.head },
              };
            }
            clipboardHandler?.onPasteShortcut();
          }
        }

        // Some browsers do not dispatch beforeinput(deleteContentBackward)
        // at list-item boundaries. Handle this path on keydown.
        if (
          e.key === "Backspace" &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          readSelectionFromDOM
        ) {
          const domSelection = readSelectionFromDOM();
          if (
            domSelection &&
            domSelection.anchor.blockId === domSelection.head.blockId &&
            domSelection.anchor.offset === domSelection.head.offset &&
            domSelection.anchor.offset === 0
          ) {
            const state = this.getViewState();
            const currentBlock = findBlockInTree(state.blocks, domSelection.anchor.blockId);
            const parentInfo = currentBlock
              ? findParentBlock(state.blocks, domSelection.anchor.blockId)
              : null;
            const insideListItem =
              !!currentBlock &&
              (currentBlock.type === "listItem" || currentBlock.type === "todoItem") &&
              !!parentInfo &&
              (
                parentInfo.parent.type === "bulletList" ||
                parentInfo.parent.type === "orderedList" ||
                parentInfo.parent.type === "todoList"
              );
            if (insideListItem && !isBlockEmpty(currentBlock)) {
              e.preventDefault();
              try {
                beginSelectionChangeLock();
                inputHandledByWasm = true;
                const converted = this.chain().setBlockType("paragraph").run();
                if (converted) {
                  const nextSelection = this.getViewState().selection;
                  currentSelection = {
                    type: "text",
                    anchor: { blockId: nextSelection.anchor.blockId, offset: nextSelection.anchor.offset },
                    head: { blockId: nextSelection.head.blockId, offset: nextSelection.head.offset },
                  };
                  publishSelection();
                  scheduleSelectionRestore();
                  return;
                }
              } catch {
                // Fall through to regular key processing.
              }
              clearSelectionChangeLock();
            }
          }
        }

        const selection = document.getSelection();
        const selectionTarget =
          selection?.anchorNode instanceof HTMLElement
            ? selection.anchorNode
            : selection?.anchorNode?.parentElement ?? null;
        const whenTarget =
          (selectionTarget && element.contains(selectionTarget) ? selectionTarget : null) ??
          (e.target instanceof HTMLElement ? e.target : element);

        for (const ext of resolved) {
          if (ext.keybindings) {
            for (const kb of ext.keybindings) {
              if (matchKeybinding(e, kb.key)) {
                if (kb.when && !evaluateWhen(kb.when, whenTarget)) {
                  continue;
                }
                const result = kb.command(this);
                if (result !== false) {
                  e.preventDefault();
                  return;
                }
              }
            }
          }
        }
      }, { signal });

      // Input rules from extensions
      element.addEventListener("input", () => {
        if (composingBlockId !== null) return;
        // Skip input rules if WASM already handled this — DOM correction
        // happens in the rAF callback of scheduleSelectionRestore()
        if (inputHandledByWasm) return;

        const state = this.getViewState();
        const block = state.blocks.find((b) => b.id === state.selection.anchor.blockId);
        if (!block || !Array.isArray(block.content)) return;
        const text = block.content.map((s) => s.text).join("");

        for (const ext of resolved) {
          if (ext.inputRules) {
            for (const rule of ext.inputRules) {
              const match = text.match(rule.pattern);
              if (match) {
                rule.handler(this, match);
                return;
              }
            }
          }
        }
      }, { signal });

      if (options.autofocus) {
        element.focus();
      }
    },

    unmount(): void {
      if (mountedElement) {
        mountAbort?.abort();
        mountAbort = null;
        scheduleDomSelectionRestore = null;
        restoreDomSelectionImmediately = null;
        readSelectionFromDOM = null;
        mountedElement.removeAttribute("contenteditable");
        mountedElement.removeAttribute("data-gotipe-editor");
        mountedElement = null;
        clipboardHandler = null;
      }
    },

    destroy(): void {
      if (destroyed) return;
      for (const ext of [...resolved].reverse()) {
        ext.onDestroy?.(this);
      }
      this.emit("destroy", { editor: this });
      this.unmount();
      bridge.destroy();
      listeners.clear();
      destroyed = true;
    },
  };

  // Initialize extensions in dependency order
  for (const ext of resolved) {
    ext.onCreate?.(editor);
  }

  // Wire up option callbacks
  if (options.onUpdate) editor.on("update", options.onUpdate);
  if (options.onSelectionChange) editor.on("selectionChange", options.onSelectionChange);
  if (options.onFocus) editor.on("focus", options.onFocus);
  if (options.onBlur) editor.on("blur", options.onBlur);
  if (options.onCreate) editor.on("create", options.onCreate);
  if (options.onDestroy) editor.on("destroy", options.onDestroy);

  editor.emit("create", { editor });

  return editor;
}

const WHEN_SELECTORS: Record<string, string> = {
  inTable: "table",
  inCodeBlock: "pre, .gotipe-code-block",
  inList: "ul, ol",
  inBlockquote: "blockquote",
};

function evaluateWhen(condition: string, target: HTMLElement): boolean {
  const selector = WHEN_SELECTORS[condition];
  if (!selector) return true;
  return target.closest(selector) !== null;
}

function matchKeybinding(event: KeyboardEvent, key: string): boolean {
  const parts = key.toLowerCase().split("-");
  const mainKey = parts[parts.length - 1];
  const needsMod = parts.includes("mod");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");

  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  const modPressed = isMac ? event.metaKey : event.ctrlKey;

  if (needsMod && !modPressed) return false;
  if (!needsMod && modPressed) return false;
  if (needsShift && !event.shiftKey) return false;
  if (!needsShift && event.shiftKey) return false;
  if (needsAlt && !event.altKey) return false;
  if (!needsAlt && event.altKey) return false;

  if (event.key.toLowerCase() === mainKey) return true;
  // Non-Latin layouts (e.g. Russian): Cmd+B reports key "и" — match the
  // physical key instead, so shortcuts work on any layout.
  if (mainKey && /^[a-z]$/.test(mainKey) && event.code === `Key${mainKey.toUpperCase()}`) {
    return !/^[a-z]$/i.test(event.key);
  }
  if (mainKey && /^[0-9]$/.test(mainKey) && event.code === `Digit${mainKey}`) {
    return !/^[0-9]$/.test(event.key);
  }
  return false;
}
