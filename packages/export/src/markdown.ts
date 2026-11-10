import type { GoTipeEditor } from "@gotipe/core";
import { validateOptionNames } from "./options";

/** Markdown has no HTML class or stylesheet options. */
export function exportToMarkdown(editor: GoTipeEditor, options?: Record<string, never>): string {
  validateOptionNames(options, []);
  return editor.getMarkdown();
}
