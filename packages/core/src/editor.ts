import { ChainableCommands } from "./chain";
import { ClipboardHandler } from "./clipboard/handler";
import { GoTipeError } from "./error";
import { applyPolyfills } from "./polyfills";
import type { EditorEvents } from "./types/events";
import type { Extension, MarkSpec, NodeSpec, SlashCommandDef } from "./types/extension";
import type { ViewState } from "./types/view";
import { WasmBridge } from "./wasm-bridge";

export interface CreateEditorOptions {
  extensions: (Extension | Extension[])[];
  content?: string | object;
  editable?: boolean;
  autofocus?: boolean | "start" | "end";
  onUpdate?: (props: { editor: GoTipeEditor }) => void;
  onSelectionChange?: (props: { editor: GoTipeEditor }) => void;
  onFocus?: (props: { editor: GoTipeEditor }) => void;
  onBlur?: (props: { editor: GoTipeEditor }) => void;
  onCreate?: (props: { editor: GoTipeEditor }) => void;
  onDestroy?: (props: { editor: GoTipeEditor }) => void;
}

export interface GoTipeEditor {
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
  setContent(content: string | object): void;
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
  if (block.content === null) return true;
  if (Array.isArray(block.content)) {
    return block.content.length === 0 || block.content.every((s) => s.text === "");
  }
  if (typeof block.content === "string") return block.content === "";
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

export async function createEditor(options: CreateEditorOptions): Promise<GoTipeEditor> {
  applyPolyfills();

  const bridge = new WasmBridge();
  await bridge.init();

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

  const editor: GoTipeEditor = {
    get isDestroyed() {
      return destroyed;
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
        const raw = JSON.parse(json);
        // Convert from WASM format (block_type, content: {type: "RichText"}) to JS format
        parsed = fromWasmDoc(raw) as Record<string, unknown>;
      } catch {
        // WASM getState failed — use initial content as fallback
        parsed = fallbackContent as Record<string, unknown>;
      }

      const blocks = (parsed?.blocks as ViewState["blocks"]) ?? [];
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
        decorations: (parsed?.decorations as ViewState["decorations"]) ?? [],
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

    setContent(content: string | object): void {
      const json = typeof content === "string" ? { blocks: [], version: 1 } : content;
      const wasmJson = toWasmDoc(json as Record<string, unknown>);
      bridge.create(schemaJson, JSON.stringify(wasmJson));
      cachedViewState = null;
      this.emit("update", { editor: this });
      this.emit("viewStateChange", this.getViewState());
      if (currentSelection.anchor.blockId) {
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
      element.setAttribute("contenteditable", options.editable !== false ? "true" : "false");
      element.setAttribute("role", "textbox");
      element.setAttribute("aria-multiline", "true");
      element.setAttribute("data-gotipe-editor", "");

      clipboardHandler = new ClipboardHandler(this);

      element.addEventListener("paste", (e) => clipboardHandler?.onPaste(e), { signal });
      element.addEventListener("copy", (e) => clipboardHandler?.onCopy(e), { signal });
      element.addEventListener("cut", (e) => clipboardHandler?.onCut(e), { signal });
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
        // Calculate text offset within this block by walking the text nodes
        let textOffset = 0;
        const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
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

        const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
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
      const correctDomFromWasmState = () => {
        if (!mountedElement) return;
        const state = this.getViewState();
        for (const block of state.blocks) {
          if (!Array.isArray(block.content)) continue;
          const blockEl = mountedElement.querySelector(
            `[data-block-id="${block.id}"]`,
          );
          if (!blockEl) continue;
          const expected = block.content.map((s) => s.text).join("");
          const actual = blockEl.textContent ?? "";
          if (actual !== expected) {
            const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
            const textNodes: Text[] = [];
            let tn: Node | null;
            while ((tn = walker.nextNode())) textNodes.push(tn as Text);

            if (textNodes.length === 1 && block.content.length === 1) {
              textNodes[0]!.nodeValue = expected;
            } else if (textNodes.length > 0) {
              let nodeIdx = 0;
              let spanIdx = 0;
              while (spanIdx < block.content.length && nodeIdx < textNodes.length) {
                textNodes[nodeIdx]!.nodeValue = block.content[spanIdx]!.text;
                nodeIdx++;
                spanIdx++;
              }
              while (nodeIdx < textNodes.length) {
                textNodes[nodeIdx]!.nodeValue = "";
                nodeIdx++;
              }
            }
          }
        }
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
            correctDomFromWasmState();
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

      // Track selection changes from user interaction
      let ignoreSelectionChange = false;
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

      const onSelectionChange = () => {
        if (ignoreSelectionChange) return;
        const selection = readSelectionFromDOM?.();
        if (!selection) return;
        currentSelection = {
          type: "text" as const,
          anchor: { ...selection.anchor },
          head: { ...selection.head },
        };
        storedMarks = null;
        publishSelection();
      };
      document.addEventListener("selectionchange", onSelectionChange, { signal });

      // --- Native input leak protection ---
      // Some environments (headless browsers, certain IME) ignore
      // beforeinput.preventDefault(). Track whether we handled the input
      // via WASM so we can correct the DOM in the `input` event if the
      // native mutation leaked through.
      let inputHandledByWasm = false;

      // --- beforeinput: capture text editing intent ---
      element.addEventListener("beforeinput", (e) => {
        if (options.editable === false) return;
        const inputType = e.inputType;

        if (
          inputType === "insertText" ||
          inputType === "insertCompositionText" ||
          inputType === "insertLineBreak"
        ) {
          const data = inputType === "insertLineBreak" ? "\n" : e.data;
          if (!data) return;
          e.preventDefault();

          const pos = currentSelection;
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
            // Collapsed cursor: inherit from left character
            marksForInsert = getMarksAt(state.blocks, pos.anchor.blockId, pos.anchor.offset);
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

          try {
            ignoreSelectionChange = true;
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
            setTimeout(() => { ignoreSelectionChange = false; }, 50);
            // Check input rules inline (the `input` event handler skips
            // them when inputHandledByWasm is true to avoid double handling)
            const ruleState = this.getViewState();
            const ruleBlock = findBlockInTree(ruleState.blocks, pos.anchor.blockId);
            if (ruleBlock && Array.isArray(ruleBlock.content)) {
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
                const caretOffset = Math.max(0, Math.min(newOffset, ruleText.length));
                const beforeCaret = ruleText.slice(0, caretOffset);
                const slashIdx = beforeCaret.lastIndexOf("/");
                if (slashIdx !== -1) {
                  const prevChar = slashIdx > 0 ? beforeCaret[slashIdx - 1] ?? "" : "";
                  const query = beforeCaret.slice(slashIdx + 1);
                  if ((slashIdx === 0 || /\s/.test(prevChar)) && !/\s/.test(query)) {
                    this.emit("openSlashMenu");
                  }
                }
              }
            }
          } catch {
            ignoreSelectionChange = false;
          }
          return;
        }

        if (inputType === "insertParagraph") {
          e.preventDefault();
          const pos = currentSelection;
          if (!pos?.anchor.blockId) return;

          // Check if current block is an empty listItem → exit the list
          const preState = this.getViewState();
          const currentBlock = findBlockInTree(preState.blocks, pos.anchor.blockId);
          if (
            currentBlock &&
            (currentBlock.type === "listItem" || currentBlock.type === "todoItem") &&
            pos.anchor.offset === 0 &&
            isBlockEmpty(currentBlock)
          ) {
            // Find parent list and unwrap this empty item
            const parentInfo = findParentBlock(preState.blocks, pos.anchor.blockId);
            if (parentInfo) {
              const listBlock = parentInfo.parent;
              const listLoc = findBlockLocation(preState.blocks, listBlock.id);
              if (listLoc) {
                try {
                  ignoreSelectionChange = true;
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
                  setTimeout(() => { ignoreSelectionChange = false; }, 50);
                } catch {
                  ignoreSelectionChange = false;
                }
                return;
              }
            }
          }

          try {
            ignoreSelectionChange = true;
            inputHandledByWasm = true;
            this.dispatch({
              steps: [{ type: "splitBlock", blockId: pos.anchor.blockId, offset: pos.anchor.offset }],
            });
            const state = this.getViewState();
            const loc = findBlockAndSibling(state.blocks, pos.anchor.blockId);
            if (loc) {
              currentSelection = {
                type: "text",
                anchor: { blockId: loc.id, offset: 0 },
                head: { blockId: loc.id, offset: 0 },
              };
            }
            publishSelection();
            scheduleSelectionRestore();
            setTimeout(() => { ignoreSelectionChange = false; }, 50);
          } catch {
            ignoreSelectionChange = false;
          }
          return;
        }

        if (inputType === "deleteContentBackward") {
          e.preventDefault();
          const pos = currentSelection;
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
            const blockIdx = state.blocks.findIndex((b) => b.id === pos.anchor.blockId);
            if (blockIdx > 0) {
              const prevBlock = state.blocks[blockIdx - 1]!;
              const prevLen = Array.isArray(prevBlock.content)
                ? prevBlock.content.reduce((sum, s) => sum + s.text.length, 0)
                : typeof prevBlock.content === "string"
                  ? prevBlock.content.length
                  : 0;
              steps.push({
                type: "mergeBlocks",
                blockId: pos.anchor.blockId,
                targetId: prevBlock.id,
              });
              newBlockId = prevBlock.id;
              newOffset = prevLen;
            }
          }
          if (steps.length > 0) {
            try {
              ignoreSelectionChange = true;
              inputHandledByWasm = true;
              this.dispatch({ steps });
              currentSelection = {
                type: "text",
                anchor: { blockId: newBlockId, offset: newOffset },
                head: { blockId: newBlockId, offset: newOffset },
              };
              publishSelection();
              scheduleSelectionRestore();
              setTimeout(() => { ignoreSelectionChange = false; }, 50);
            } catch {
              ignoreSelectionChange = false;
            }
          }
          return;
        }

        if (inputType === "deleteContentForward") {
          e.preventDefault();
          const pos = currentSelection;
          if (!pos?.anchor.blockId) return;

          const block = this.getViewState().blocks.find((b) => b.id === pos.anchor.blockId);
          if (!block) return;
          const blockTextLen = Array.isArray(block.content)
            ? block.content.reduce((sum, s) => sum + s.text.length, 0)
            : typeof block.content === "string"
              ? block.content.length
              : 0;

          try {
            ignoreSelectionChange = true;
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
            setTimeout(() => { ignoreSelectionChange = false; }, 50);
          } catch {
            ignoreSelectionChange = false;
          }
          return;
        }
      }, { signal });

      // Keyboard shortcuts from extensions
      element.addEventListener("keydown", (e) => {
        for (const ext of resolved) {
          if (ext.keybindings) {
            for (const kb of ext.keybindings) {
              if (matchKeybinding(e, kb.key)) {
                if (kb.when && !evaluateWhen(kb.when, e.target as HTMLElement)) {
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

  return event.key.toLowerCase() === mainKey;
}
