import { cloneAttributes } from "../document/attributes";
import { createId } from "../document/id";
import type { BlockContent } from "../types/block";
import type { NodeSpec } from "../types/extension";
import type { BlockView } from "../types/view";

export function listItemAttrs(
  itemType: "listItem" | "todoItem",
  source?: BlockView,
): Record<string, string | number | boolean | null> {
  if (itemType === "todoItem") {
    return {
      checked: typeof source?.attrs.checked === "boolean" ? source.attrs.checked : false,
    };
  }
  return {};
}

export function cloneInlineContent(content: BlockView["content"]): BlockContent {
  if (Array.isArray(content)) {
    return content.map((s) => ({
      text: s.text,
      marks: s.marks.map((m) => ({ type: m.type, attrs: cloneAttributes(m.attrs) })),
    }));
  }
  if (typeof content === "string") {
    if (content.length === 0) return [];
    return [{ text: content, marks: [] }];
  }
  return [];
}

export function cloneBlockTree(block: BlockView, freshIds = true): import("../types/block").Block {
  const clonedContent =
    block.content === null
      ? null
      : typeof block.content === "string"
        ? block.content
        : cloneInlineContent(block.content);
  return {
    id: freshIds ? createId() : block.id,
    type: block.type,
    attrs: cloneAttributes(block.attrs),
    content: clonedContent,
    children: block.children.map((child) => cloneBlockTree(child, freshIds)),
  };
}

/**
 * The content of a block whose type declares `kind` (`CommandSchema.content`), made from
 * `source`: raw text keeps the text without marks, a type without content drops it (D-05). A type
 * the schema does not declare — in an editor without a schema — gets rich text.
 */
export function contentFor(
  kind: NodeSpec["content"] | undefined,
  source: BlockView["content"] = null,
): BlockContent {
  if (kind === "rawText")
    return Array.isArray(source) ? source.map((span) => span.text).join("") : (source ?? "");
  return kind === "empty" ? null : cloneInlineContent(source);
}

export function blockContentTextLength(content: BlockContent): number {
  if (Array.isArray(content)) {
    return content.reduce((sum, span) => sum + span.text.length, 0);
  }
  if (typeof content === "string") return content.length;
  return 0;
}
