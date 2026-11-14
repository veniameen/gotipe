import type { BlockView } from "@gotipe/core";
import type { TableMergeGuard } from "@gotipe/react";

/** Marks the Markdown HTML table keeps; others (mentions, formulas, fonts…) keep only text. */
const HTML_TABLE_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
  "subscript",
  "superscript",
  "link",
  "textColor",
  "highlight",
]);

const kept = (cell: BlockView) =>
  !Array.isArray(cell.content) ||
  cell.content.every((span) =>
    span.marks.every(
      (mark) => HTML_TABLE_MARKS.has(mark.type) && (mark.type !== "link" || !mark.attrs.title),
    ),
  );

/**
 * A Markdown page writes a table with merged cells as an HTML table and reads it back as a table.
 * That keeps the table only at the top level of the page and only the marks the HTML table has
 * tags for; elsewhere the page refuses the merge and says why, instead of losing the table.
 */
export function markdownTableGuard(reason: string): TableMergeGuard {
  return ({ table, editor }) => {
    const topLevel = editor.getViewState().blocks.some((block) => block.id === table.id);
    const marks = table.children.every((row) => row.children.every(kept));
    return topLevel && marks ? null : reason;
  };
}
