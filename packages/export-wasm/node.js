import { readFile } from "node:fs/promises";
import initialize from "./pkg/gotipe_export_wasm.js";
export * from "./pkg/gotipe_export_wasm.js";

/** Node cannot fetch file: URLs; load the optional binary only when requested. */
export default async function initializeExporters(input) {
  return initialize(
    input ?? {
      module_or_path: await readFile(new URL("./pkg/gotipe_export_wasm_bg.wasm", import.meta.url)),
    },
  );
}
