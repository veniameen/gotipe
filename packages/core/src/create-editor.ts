import { type CreateEditorOptions, type GoTipeEditor, createEditorWithLoader } from "./editor";
import { loadWasmModule } from "./wasm-loader";

/**
 * Creates an editor. Engine `"auto"` (default) loads the WASM core and falls
 * back to the JS engine; `engine: "js"` never touches WASM.
 */
export function createEditor(options: CreateEditorOptions): Promise<GoTipeEditor> {
  return createEditorWithLoader(options, options.engine === "js" ? null : loadWasmModule);
}
