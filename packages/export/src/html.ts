import { type GoTipeEditor, serializeHtml } from "@gotipe/core";
import { validateOptionNames } from "./options";
import type { ExportOptions } from "./types";

export function exportToHtml(editor: GoTipeEditor, options?: ExportOptions): string {
  validateOptionNames(options, ["includeStyles", "classPrefix"]);
  return options
    ? serializeHtml(editor.getViewState().blocks, {
        inlineStyles: options.includeStyles,
        classPrefix: options.classPrefix,
      })
    : editor.getHTML();
}
