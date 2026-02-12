import { ChainableCommands } from "./chain";
import { ClipboardHandler } from "./clipboard/handler";
import { GoTipeError } from "./error";
import { applyPolyfills } from "./polyfills";
import type { EditorEvents } from "./types/events";
import type { Extension, MarkSpec, NodeSpec } from "./types/extension";
import type { ViewState } from "./types/view";
import { WasmBridge } from "./wasm-bridge";

export interface CreateEditorOptions {
  extensions: Extension[];
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
  mount(element: HTMLElement): void;
  unmount(): void;
  destroy(): void;
  readonly isDestroyed: boolean;
}

function generateBlockId(): string {
  return crypto.randomUUID();
}

function resolveExtensions(extensions: Extension[]): Extension[] {
  const resolved: Extension[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const extMap = new Map<string, Extension>();

  for (const ext of extensions) {
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

  for (const ext of extensions) {
    visit(ext);
  }

  return resolved;
}

function buildSchema(extensions: Extension[]): { nodes: NodeSpec[]; marks: MarkSpec[] } {
  const nodes: NodeSpec[] = [];
  const marks: MarkSpec[] = [];

  for (const ext of extensions) {
    if (ext.nodes) nodes.push(...ext.nodes);
    if (ext.marks) marks.push(...ext.marks);
  }

  return { nodes, marks };
}

export async function createEditor(options: CreateEditorOptions): Promise<GoTipeEditor> {
  applyPolyfills();

  const bridge = new WasmBridge();
  await bridge.init();

  const resolved = resolveExtensions(options.extensions);
  const schema = buildSchema(resolved);

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
              content: [],
              children: [],
            },
          ],
          version: 1,
        };

  bridge.create(JSON.stringify(schema), JSON.stringify(initialContent));

  // Event emitter
  type Listener = (...args: unknown[]) => void;
  const listeners = new Map<string, Set<Listener>>();
  let destroyed = false;
  let mountedElement: HTMLElement | null = null;
  let clipboardHandler: ClipboardHandler | null = null;
  let cachedViewState: ViewState | null = null;

  const editor: GoTipeEditor = {
    get isDestroyed() {
      return destroyed;
    },

    getViewState(): ViewState {
      if (cachedViewState) return cachedViewState;
      try {
        const json = bridge.getState();
        const parsed = JSON.parse(json);
        cachedViewState = {
          blocks: parsed.blocks ?? [],
          selection: parsed.selection ?? {
            type: "text",
            anchor: { blockId: "", offset: 0 },
            head: { blockId: "", offset: 0 },
          },
          decorations: parsed.decorations ?? [],
          toolbar: parsed.toolbar ?? {
            activeMarks: [],
            activeBlockType: "paragraph",
            activeBlockAttrs: {},
            canUndo: false,
            canRedo: false,
          },
          version: parsed.version ?? 1,
        };
        return cachedViewState;
      } catch {
        return {
          blocks: [],
          selection: {
            type: "text",
            anchor: { blockId: "", offset: 0 },
            head: { blockId: "", offset: 0 },
          },
          decorations: [],
          toolbar: {
            activeMarks: [],
            activeBlockType: "paragraph",
            activeBlockAttrs: {},
            canUndo: false,
            canRedo: false,
          },
          version: 1,
        };
      }
    },

    getJSON(): object {
      const state = bridge.getState();
      return JSON.parse(state);
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

    chain(): ChainableCommands {
      return new ChainableCommands(this);
    },

    dispatch(transaction: object): void {
      if (destroyed) return;
      try {
        bridge.apply(JSON.stringify(transaction));
        cachedViewState = null;
        this.emit("update", { editor: this });
        this.emit("viewStateChange", this.getViewState());
      } catch (e) {
        throw new GoTipeError(
          "TRANSFORM_ERROR",
          e instanceof Error ? e.message : "Transaction failed",
        );
      }
    },

    setContent(content: string | object): void {
      const json = typeof content === "string" ? { blocks: [], version: 1 } : content;
      bridge.create(JSON.stringify(buildSchema(resolved)), JSON.stringify(json));
      cachedViewState = null;
      this.emit("update", { editor: this });
      this.emit("viewStateChange", this.getViewState());
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
      element.setAttribute("contenteditable", options.editable !== false ? "true" : "false");
      element.setAttribute("role", "textbox");
      element.setAttribute("aria-multiline", "true");
      element.setAttribute("data-gotipe-editor", "");

      clipboardHandler = new ClipboardHandler(this);

      element.addEventListener("paste", (e) => clipboardHandler?.onPaste(e));
      element.addEventListener("copy", (e) => clipboardHandler?.onCopy(e));
      element.addEventListener("cut", (e) => clipboardHandler?.onCut(e));
      element.addEventListener("focus", () => this.emit("focus", { editor: this }));
      element.addEventListener("blur", () => this.emit("blur", { editor: this }));

      // Keyboard shortcuts from extensions
      element.addEventListener("keydown", (e) => {
        for (const ext of resolved) {
          if (ext.keybindings) {
            for (const kb of ext.keybindings) {
              if (matchKeybinding(e, kb.key)) {
                const result = kb.command(this);
                if (result !== false) {
                  e.preventDefault();
                  return;
                }
              }
            }
          }
        }
      });

      // Input rules from extensions
      element.addEventListener("input", () => {
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
      });

      if (options.autofocus) {
        element.focus();
      }
    },

    unmount(): void {
      if (mountedElement) {
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

function matchKeybinding(event: KeyboardEvent, key: string): boolean {
  const parts = key.toLowerCase().split("-");
  const mainKey = parts[parts.length - 1];
  const needsMod = parts.includes("mod");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");

  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  const modPressed = isMac ? event.metaKey : event.ctrlKey;

  if (needsMod && !modPressed) return false;
  if (needsShift && !event.shiftKey) return false;
  if (needsAlt && !event.altKey) return false;

  return event.key.toLowerCase() === mainKey;
}
