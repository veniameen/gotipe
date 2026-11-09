// @gotipe/core/js — the same API as @gotipe/core with the pure JS engine.
// Nothing here references @gotipe/wasm, so bundles stay free of WASM and the
// editor runs under a CSP without 'wasm-unsafe-eval'.
import { type CreateEditorOptions, type GoTipeEditor, createEditorWithLoader } from "./editor";
import { GoTipeError } from "./error";

export * from "./common";

/** Creates an editor on the JS engine (`engine: "wasm"` is rejected). */
export function createEditor(options: CreateEditorOptions): Promise<GoTipeEditor> {
  if (options.engine === "wasm") {
    return Promise.reject(
      new GoTipeError(
        "WASM_INIT_FAILED",
        "@gotipe/core/js has no WASM engine; import @gotipe/core instead",
      ),
    );
  }
  return createEditorWithLoader({ ...options, engine: "js" }, null);
}
