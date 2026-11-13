import { serializeMarkdown } from "@gotipe/markdown";
import { fromWasmDoc } from "./engine/conversion";
import { fallbackApply } from "./engine/js-transactions";
import { markGroups } from "./engine/mark-rules";
import { replacementTransaction } from "./engine/replacement";
import { validateEngineDocument, validateEngineStep } from "./engine/validate";
import { GoTipeError } from "./error";
import { sanitizeHtml as sanitizeHtmlJs } from "./security/sanitizer";
import { blocksToHtml } from "./serialization/html";

/**
 * Minimal surface of the `@gotipe/wasm` module the bridge needs. Declared here
 * (instead of `import type` from the package) so the JS engine build never
 * references `@gotipe/wasm` at all — not even for types.
 */
export interface WasmEditorLike {
  free?(): void;
  apply(transactionJson: string): string;
  validate(docJson: string): boolean;
  export_json(): string;
  sanitize_html(html: string): string;
  enable_collaboration(peerId: string): void;
  receive_update(binary: Uint8Array): string;
  get_update(): Uint8Array;
  undo_collaboration(): string | undefined;
  redo_collaboration(): string | undefined;
  can_undo_collaboration(): boolean;
  can_redo_collaboration(): boolean;
  clear_collaboration_history(): void;
  export_selection(): string;
  set_selection(selectionJson: string): void;
  add_comment(json: string): string;
  resolve_comment(id: string): void;
  get_comments(): string;
  create_version(name: string): string;
  list_versions(): string;
  restore_version(id: string): string;
  detect_pii(text: string): string;
}

export interface WasmModuleLike {
  WasmEditor: new (schemaJson: string, docJson: string) => WasmEditorLike;
}

/** Loads and initialises the WASM module. `null` means "JS engine only". */
export type WasmModuleLoader = () => Promise<WasmModuleLike>;

/** Engine selection: `auto` tries WASM and falls back to JS; `js` never touches WASM. */
export type EngineMode = "auto" | "wasm" | "js";

export class WasmBridge {
  private schema: ReturnType<typeof import("./engine/schema").toWasmSchema> | null = null;
  private editor: WasmEditorLike | null = null;
  private wasmModule: WasmModuleLike | null = null;
  private initialized = false;
  private fallbackMode = false;
  private fallbackState: string | null = null;
  private collaborationEnabled = false;
  private prepared: { before: string; transaction: string; after: string } | null = null;

  constructor(
    private readonly loader: WasmModuleLoader | null = null,
    private readonly mode: EngineMode = "auto",
  ) {}

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.mode === "js" || !this.loader) {
      if (this.mode === "wasm") {
        throw new GoTipeError(
          "WASM_INIT_FAILED",
          "WASM engine requested but no WASM loader is available",
        );
      }
      this.fallbackMode = true;
      this.initialized = true;
      return;
    }
    try {
      this.wasmModule = await this.loader();
      this.initialized = true;
    } catch (e) {
      if (this.mode === "wasm") {
        throw new GoTipeError(
          "WASM_INIT_FAILED",
          e instanceof Error ? e.message : "WASM init failed",
        );
      }
      console.warn("GoTipe WASM init failed, using JS engine:", e);
      this.fallbackMode = true;
      this.initialized = true;
    }
  }

  get isFallback(): boolean {
    return this.fallbackMode;
  }

  /** The engine actually in use. */
  get engine(): "wasm" | "js" {
    return this.fallbackMode ? "js" : "wasm";
  }

  get isCollaborating(): boolean {
    return this.collaborationEnabled;
  }
  get canUndoCollaboration(): boolean {
    return this.editor?.can_undo_collaboration() ?? false;
  }
  get canRedoCollaboration(): boolean {
    return this.editor?.can_redo_collaboration() ?? false;
  }
  undoCollaboration(): string | null {
    return this.editor?.undo_collaboration() ?? null;
  }
  redoCollaboration(): string | null {
    return this.editor?.redo_collaboration() ?? null;
  }
  clearCollaborationHistory(): void {
    this.editor?.clear_collaboration_history();
  }
  getSelection(): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.export_selection();
  }
  setSelection(selection: string): void {
    this.editor?.set_selection(selection);
  }

  create(schemaJson: string, docJson: string): void {
    const schema = JSON.parse(schemaJson);
    if (!validateEngineDocument(schema, JSON.parse(docJson)))
      throw new GoTipeError("VALIDATION_ERROR", "Document does not match the editor schema");
    this.schema = schema;
    this.prepared = null;
    if (this.collaborationEnabled && this.editor) {
      this.restoreState(schemaJson, docJson);
      return;
    }
    if (this.fallbackMode) {
      this.fallbackState = docJson;
      return;
    }
    if (!this.wasmModule) throw new GoTipeError("EDITOR_NOT_INITIALIZED", "WASM module not loaded");
    const next = new this.wasmModule.WasmEditor(schemaJson, docJson);
    this.editor?.free?.();
    this.editor = next;
  }

  preview(transactionJson: string): string {
    const before = this.getState();
    if (this.prepared?.before === before && this.prepared.transaction === transactionJson)
      return this.prepared.after;
    const after = fallbackApply(
      before,
      transactionJson,
      (step, document) => {
        if (!this.schema || !validateEngineStep(this.schema, step, document))
          throw new GoTipeError(
            "VALIDATION_ERROR",
            "Transaction step does not match the editor schema",
          );
      },
      markGroups(this.schema),
    );
    if (!this.schema || !validateEngineDocument(this.schema, JSON.parse(after)))
      throw new GoTipeError(
        "VALIDATION_ERROR",
        "Transaction result does not match the editor schema",
      );
    this.prepared = { before, transaction: transactionJson, after };
    return after;
  }

  apply(transactionJson: string): string {
    const after = this.preview(transactionJson);
    this.prepared = null;
    if (this.fallbackMode && this.fallbackState) {
      this.fallbackState = after;
      return this.fallbackState;
    }
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED", "Editor not initialized");
    return this.editor.apply(transactionJson);
  }

  validate(docJson: string): boolean {
    if (!this.schema) return false;
    try {
      if (!validateEngineDocument(this.schema, JSON.parse(docJson))) return false;
      if (this.fallbackMode || !Object.keys(this.schema.nodes).length) return true;
      return this.editor?.validate(docJson) ?? false;
    } catch {
      return false;
    }
  }

  getState(): string {
    if (this.fallbackMode && this.fallbackState) {
      return this.fallbackState;
    }
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED", "Editor not initialized");
    return this.editor.export_json();
  }

  /** One serializer for both engines: the same document gives the same HTML. */
  exportHtml(): string {
    return blocksToHtml(fromWasmDoc(JSON.parse(this.getState())).blocks);
  }

  exportMarkdown(): string {
    return serializeMarkdown(fromWasmDoc(JSON.parse(this.getState()))).text;
  }

  sanitizeHtml(html: string): string {
    if (this.fallbackMode) return sanitizeHtmlJs(html);
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.sanitize_html(html);
  }

  enableCollaboration(peerId: string): void {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    this.editor.enable_collaboration(peerId);
    this.collaborationEnabled = true;
  }

  receiveUpdate(binary: Uint8Array): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.receive_update(binary);
  }

  getUpdate(): Uint8Array {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.get_update();
  }

  addComment(json: string): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.add_comment(json);
  }

  resolveComment(id: string): void {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    this.editor.resolve_comment(id);
  }

  getComments(): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.get_comments();
  }

  createVersion(name: string): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.create_version(name);
  }

  listVersions(): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.list_versions();
  }

  restoreVersion(id: string): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.restore_version(id);
  }

  detectPii(text: string): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.detect_pii(text);
  }

  restoreState(schemaJson: string, stateJson: string): void {
    if (!validateEngineDocument(JSON.parse(schemaJson), JSON.parse(stateJson)))
      throw new GoTipeError("VALIDATION_ERROR", "Document does not match the editor schema");
    this.prepared = null;
    if (this.collaborationEnabled && this.editor) {
      this.editor.apply(replacementTransaction(this.editor.export_json(), stateJson));
      return;
    }
    if (this.fallbackMode) {
      this.fallbackState = stateJson;
      return;
    }
    if (!this.wasmModule) throw new GoTipeError("EDITOR_NOT_INITIALIZED", "WASM module not loaded");
    const next = new this.wasmModule.WasmEditor(schemaJson, stateJson);
    this.editor?.free?.();
    this.editor = next;
  }

  forceFallback(docJson: string): void {
    this.editor?.free?.();
    this.collaborationEnabled = false;
    this.fallbackMode = true;
    this.fallbackState = docJson;
    this.editor = null;
  }

  destroy(): void {
    this.editor?.free?.();
    this.collaborationEnabled = false;
    this.editor = null;
  }
}
