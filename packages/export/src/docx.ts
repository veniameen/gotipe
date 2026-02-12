import type { GoTipeEditor } from "@gotipe/core";
import type { DocxOptions } from "./types";

/**
 * Export to DOCX via lazy-loaded WASM module (~60KB).
 * NOT bundled in core.
 */
export async function exportToDocx(
  editor: GoTipeEditor,
  options?: DocxOptions,
): Promise<Uint8Array> {
  // Lazy-loaded WASM — module exists only after `pnpm build:wasm`
  const wasm = await import(/* webpackIgnore: true */ "@gotipe/wasm/pkg/gotipe_wasm.js" as string);
  const exportDocx: (json: string, config: string) => Uint8Array = wasm.exportDocx;
  const json = JSON.stringify(editor.getJSON());
  const config = JSON.stringify({
    title: options?.title ?? "",
    author: options?.author ?? "",
    description: options?.description ?? "",
  });
  return exportDocx(json, config);
}
