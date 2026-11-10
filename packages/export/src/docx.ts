import type { GoTipeEditor } from "@gotipe/core";
import { prepareImages } from "./assets";
import { validateOptionNames } from "./options";
import type { DocxOptions } from "./types";
import { loadExporters } from "./wasm";

/** Write a real OOXML document with the optional exporter, loaded on first use. */
export async function exportToDocx(
  editor: GoTipeEditor,
  options?: DocxOptions,
): Promise<Uint8Array> {
  validateOptionNames(options, ["resolveImage", "title", "author", "description"]);
  const document = await prepareImages(editor.getJSON(), options?.resolveImage);
  const module = await loadExporters();
  return module.exportDocx(JSON.stringify(document), JSON.stringify(options ?? {}));
}
