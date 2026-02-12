import type { WasmEditor } from "@gotipe/wasm";
import { GoTipeError } from "./error";

let initPromise: Promise<void> | null = null;
let wasmModule: typeof import("@gotipe/wasm") | null = null;

async function ensureInit(): Promise<typeof import("@gotipe/wasm")> {
  if (wasmModule) return wasmModule;
  if (!initPromise) {
    initPromise = (async () => {
      const mod = await import("@gotipe/wasm");
      await mod.default();
      wasmModule = mod;
    })();
  }
  await initPromise;
  return wasmModule!;
}

export class WasmBridge {
  private editor: WasmEditor | null = null;
  private initialized = false;
  private fallbackMode = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await ensureInit();
      this.initialized = true;
    } catch (e) {
      console.warn("GoTipe WASM init failed, using JS fallback:", e);
      this.fallbackMode = true;
      this.initialized = true;
    }
  }

  get isFallback(): boolean {
    return this.fallbackMode;
  }

  create(schemaJson: string, docJson: string): void {
    if (this.fallbackMode) return;
    const mod = wasmModule!;
    this.editor = new mod.WasmEditor(schemaJson, docJson);
  }

  apply(transactionJson: string): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED", "Editor not initialized");
    return this.editor.apply(transactionJson);
  }

  validate(docJson: string): boolean {
    if (!this.editor) return true;
    return this.editor.validate(docJson);
  }

  getState(): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED", "Editor not initialized");
    return this.editor.export_json();
  }

  exportHtml(): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.export_html();
  }

  exportMarkdown(): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.export_markdown();
  }

  sanitizeHtml(html: string): string {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    return this.editor.sanitize_html(html);
  }

  enableCollaboration(peerId: string): void {
    if (!this.editor) throw new GoTipeError("EDITOR_NOT_INITIALIZED");
    this.editor.enable_collaboration(peerId);
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

  destroy(): void {
    this.editor = null;
  }
}
