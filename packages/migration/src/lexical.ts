import type { Block } from "@gotipe/core";
import type { MigrationOptions, MigrationResult } from "./types";

interface LexicalNode {
  type: string;
  children?: LexicalNode[];
  text?: string;
  format?: number;
  tag?: string;
  [key: string]: unknown;
}

const FORMAT_BOLD = 1;
const FORMAT_ITALIC = 2;
const FORMAT_UNDERLINE = 8;
const FORMAT_STRIKETHROUGH = 4;
const FORMAT_CODE = 16;

export function convertLexicalToGoTipe(
  lexicalState: { root: LexicalNode },
  options: MigrationOptions = {},
): MigrationResult {
  const warnings: string[] = [];
  const skippedNodes = 0;
  const blockMap: Record<string, string> = {
    paragraph: "paragraph",
    heading: "heading",
    list: "bulletList",
    listitem: "listItem",
    code: "codeBlock",
    quote: "blockquote",
    horizontalrule: "divider",
    image: "image",
    table: "table",
    tablecell: "tableCell",
    tablerow: "tableRow",
    ...options.blockTypeMap,
  };

  function convertNode(node: LexicalNode): Block | null {
    if (node.type === "text") return null;

    let blockType = blockMap[node.type] ?? node.type;
    if (node.type === "heading" && node.tag) {
      blockType = "heading";
    }

    const children: Block[] = [];
    const content: Array<{
      text: string;
      marks: Array<{ type: string; attrs: Record<string, string | number | boolean | null> }>;
    }> = [];

    if (node.children) {
      for (const child of node.children) {
        if (child.type === "text" && child.text !== undefined) {
          const marks: Array<{
            type: string;
            attrs: Record<string, string | number | boolean | null>;
          }> = [];
          const fmt = child.format ?? 0;
          if (fmt & FORMAT_BOLD) marks.push({ type: "bold", attrs: {} });
          if (fmt & FORMAT_ITALIC) marks.push({ type: "italic", attrs: {} });
          if (fmt & FORMAT_UNDERLINE) marks.push({ type: "underline", attrs: {} });
          if (fmt & FORMAT_STRIKETHROUGH) marks.push({ type: "strikethrough", attrs: {} });
          if (fmt & FORMAT_CODE) marks.push({ type: "code", attrs: {} });
          content.push({ text: child.text, marks });
        } else {
          const converted = convertNode(child);
          if (converted) children.push(converted);
        }
      }
    }

    const attrs: Record<string, string | number | boolean | null> = {};
    if (node.type === "heading" && node.tag) {
      const level = Number.parseInt(node.tag.replace("h", ""), 10);
      if (!Number.isNaN(level)) attrs.level = level;
    }

    return {
      id: crypto.randomUUID(),
      type: blockType,
      attrs,
      content: content.length > 0 ? content : children.length > 0 ? null : [],
      children,
    };
  }

  const blocks: Block[] = [];
  if (lexicalState.root.children) {
    for (const child of lexicalState.root.children) {
      const block = convertNode(child);
      if (block) blocks.push(block);
    }
  }

  return { document: { blocks, version: 1 }, warnings, skippedNodes };
}
