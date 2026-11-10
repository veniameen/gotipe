import { cloneAttributes } from "../document/attributes";
import type { BlockContent } from "../types/block";
import type { BlockView } from "../types/view";

const EMPTY_CONTENT_TYPES = new Set([
  "divider",
  "file",
  "embed",
  "bulletList",
  "orderedList",
  "todoList",
  "image",
  "columns",
  "column",
  "table",
  "tableRow",
]);

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
    id: freshIds ? crypto.randomUUID() : block.id,
    type: block.type,
    attrs: cloneAttributes(block.attrs),
    content: clonedContent,
    children: block.children.map((child) => cloneBlockTree(child, freshIds)),
  };
}

export function contentForTargetType(
  type: string,
  sourceContent: BlockView["content"],
): BlockContent {
  if (["codeBlock", "math", "markdownRaw"].includes(type)) {
    if (typeof sourceContent === "string") return sourceContent;
    if (Array.isArray(sourceContent)) {
      return sourceContent.map((s) => s.text).join("");
    }
    return "";
  }
  if (EMPTY_CONTENT_TYPES.has(type)) {
    return null;
  }
  return cloneInlineContent(sourceContent);
}

export function blockContentTextLength(content: BlockContent): number {
  if (Array.isArray(content)) {
    return content.reduce((sum, span) => sum + span.text.length, 0);
  }
  if (typeof content === "string") return content.length;
  return 0;
}

export function blockContent(type: string): BlockContent | null {
  return EMPTY_CONTENT_TYPES.has(type)
    ? null
    : ["codeBlock", "math", "markdownRaw"].includes(type)
      ? ""
      : [];
}
