import { readFile } from "node:fs/promises";
import initialize from "./pkg/gotipe_wasm.js";
export * from "./pkg/gotipe_wasm.js";

/**
 * The `node` condition of `@gotipe/wasm`. Node cannot fetch the binary's `file:` URL, so
 * without an input the module reads it from the package; an input passes through unchanged.
 */
export default async function initializeEngine(input) {
  return initialize(
    input ?? {
      module_or_path: await readFile(new URL("./pkg/gotipe_wasm_bg.wasm", import.meta.url)),
    },
  );
}
