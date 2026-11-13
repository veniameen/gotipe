import type { GoTipeEditor } from "@gotipe/core";
import { prepareImages } from "./assets";
import { validateOptionNames } from "./options";
import type { PdfOptions } from "./types";
import { exportBytes, loadExporters } from "./wasm";

/** Typeset a PDF with the optional exporter, loaded on first use. */
export async function exportToPdf(
  editor: GoTipeEditor,
  options?: PdfOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  validateOptionNames(options, [
    "resolveImage",
    "pageSize",
    "margin",
    "fontSize",
    "headerTemplate",
    "footerTemplate",
    "lang",
    "title",
    "author",
  ]);
  const document = await prepareImages(editor.getJSON(), options?.resolveImage);
  const module = await loadExporters();
  return exportBytes(() =>
    module.exportPdf(JSON.stringify(document), JSON.stringify(options ?? {})),
  );
}
