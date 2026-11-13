import { type GoTipeEditor, serializeHtml } from "@gotipe/core";
import { validateOptionNames } from "./options";
import type { ExportOptions } from "./types";

/** The editor's canonical HTML; the same serializer as `editor.getHTML()` and `serializeHtml`. */
export function exportToHtml(editor: GoTipeEditor, options?: ExportOptions): string {
  validateOptionNames(options, ["inlineStyles", "includeStyles", "classPrefix"]);
  return serializeHtml(editor.getJSON().blocks, options ?? {});
}
