import type { GoTipeEditor } from "@gotipe/core";
import type { PdfOptions } from "./types";

/**
 * Export to PDF via lazy-loaded WASM module (~400KB).
 * Uses typst for rendering. NOT bundled in core.
 */
export async function exportToPdf(editor: GoTipeEditor, options?: PdfOptions): Promise<Uint8Array> {
  // Lazy-loaded WASM — module exists only after `pnpm build:wasm`
  const wasm = await import(/* webpackIgnore: true */ "@gotipe/wasm/pkg/gotipe_wasm.js" as string);
  const exportPdf: (json: string, config: string) => Uint8Array = wasm.exportPdf;
  const json = JSON.stringify(editor.getJSON());
  const config = JSON.stringify({
    pageSize: options?.pageSize ?? "a4",
    margin: options?.margin ?? { top: 72, right: 72, bottom: 72, left: 72 },
    fontSize: options?.fontSize ?? 12,
  });
  return exportPdf(json, config);
}
