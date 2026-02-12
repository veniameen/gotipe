import type { Block } from "@gotipe/core";
import type { MigrationOptions, MigrationResult } from "./types";

interface SlateNode {
  type?: string;
  children?: SlateNode[];
  text?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  [key: string]: unknown;
}

export function convertSlateToGoTipe(
  slateNodes: SlateNode[],
  options: MigrationOptions = {},
): MigrationResult {
  const warnings: string[] = [];
  const skippedNodes = 0;
  const blockMap: Record<string, string> = {
    paragraph: "paragraph",
    heading: "heading",
    "bulleted-list": "bulletList",
    "numbered-list": "orderedList",
    "list-item": "listItem",
    "code-block": "codeBlock",
    "block-quote": "blockquote",
    image: "image",
    table: "table",
    "table-row": "tableRow",
    "table-cell": "tableCell",
    ...options.blockTypeMap,
  };

  function convertNode(node: SlateNode): Block | null {
    if (node.text !== undefined) return null; // text nodes handled by parent

    const blockType = blockMap[node.type ?? "paragraph"] ?? node.type ?? "paragraph";
    const children: Block[] = [];
    const content: Array<{
      text: string;
      marks: Array<{ type: string; attrs: Record<string, string | number | boolean | null> }>;
    }> = [];

    if (node.children) {
      for (const child of node.children) {
        if (child.text !== undefined) {
          const marks: Array<{
            type: string;
            attrs: Record<string, string | number | boolean | null>;
          }> = [];
          if (child.bold) marks.push({ type: "bold", attrs: {} });
          if (child.italic) marks.push({ type: "italic", attrs: {} });
          if (child.underline) marks.push({ type: "underline", attrs: {} });
          if (child.strikethrough) marks.push({ type: "strikethrough", attrs: {} });
          if (child.code) marks.push({ type: "code", attrs: {} });
          content.push({ text: child.text, marks });
        } else {
          const converted = convertNode(child);
          if (converted) children.push(converted);
        }
      }
    }

    return {
      id: crypto.randomUUID(),
      type: blockType,
      attrs: {} as Record<string, string | number | boolean | null>,
      content: content.length > 0 ? content : children.length > 0 ? null : [],
      children,
    };
  }

  const blocks: Block[] = [];
  for (const node of slateNodes) {
    const block = convertNode(node);
    if (block) blocks.push(block);
  }

  return { document: { blocks, version: 1 }, warnings, skippedNodes };
}
