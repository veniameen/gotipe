import type { GoTipeEditor } from "@gotipe/core";
import { validateOptionNames } from "./options";

/**
 * Canonical Markdown of the current document, as `editor.getMarkdown()`. Front matter and
 * the source bytes of untouched blocks live in a parse snapshot: to save a file without
 * rewriting it, call `serializeMarkdown(editor.getJSON(), snapshot)` from @gotipe/markdown.
 */
export function exportToMarkdown(editor: GoTipeEditor, options?: Record<string, never>): string {
  validateOptionNames(options, []);
  return editor.getMarkdown();
}
