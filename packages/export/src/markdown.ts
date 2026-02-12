import type { GoTipeEditor } from "@gotipe/core";
import type { ExportOptions } from "./types";

export function exportToMarkdown(editor: GoTipeEditor, _options?: ExportOptions): string {
  return editor.getMarkdown();
}
