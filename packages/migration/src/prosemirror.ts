import type { Block } from "@gotipe/core";
import type { MigrationOptions, MigrationResult } from "./types";

interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

const DEFAULT_BLOCK_MAP: Record<string, string> = {
  paragraph: "paragraph",
  heading: "heading",
  bullet_list: "bulletList",
  ordered_list: "orderedList",
  list_item: "listItem",
  code_block: "codeBlock",
  blockquote: "blockquote",
  horizontal_rule: "divider",
  image: "image",
  table: "table",
  table_row: "tableRow",
  table_cell: "tableCell",
  table_header: "tableHeader",
};

const DEFAULT_MARK_MAP: Record<string, string> = {
  bold: "bold",
  strong: "bold",
  italic: "italic",
  em: "italic",
  underline: "underline",
  strike: "strikethrough",
  strikethrough: "strikethrough",
  code: "code",
  link: "link",
};

export function convertProseMirrorToGoTipe(
  pmDoc: ProseMirrorNode,
  options: MigrationOptions = {},
): MigrationResult {
  const warnings: string[] = [];
  let skippedNodes = 0;
  const blockMap = { ...DEFAULT_BLOCK_MAP, ...options.blockTypeMap };
  const markMap = { ...DEFAULT_MARK_MAP, ...options.markTypeMap };

  function convertNode(node: ProseMirrorNode): Block | null {
    const blockType = blockMap[node.type];
    if (!blockType) {
      if (options.strict) throw new Error(`Unknown ProseMirror node type: ${node.type}`);
      warnings.push(`Skipped unknown node type: ${node.type}`);
      options.onWarning?.(`Skipped unknown node type: ${node.type}`);
      skippedNodes++;
      return null;
    }

    const children: Block[] = [];
    const content: Array<{
      text: string;
      marks: Array<{ type: string; attrs: Record<string, string | number | boolean | null> }>;
    }> = [];

    if (node.content) {
      for (const child of node.content) {
        if (child.text !== undefined) {
          content.push({
            text: child.text,
            marks: (child.marks ?? []).map((m) => ({
              type: markMap[m.type] ?? m.type,
              attrs: (m.attrs ?? {}) as Record<string, string | number | boolean | null>,
            })),
          });
        } else {
          const converted = convertNode(child);
          if (converted) children.push(converted);
        }
      }
    }

    return {
      id: crypto.randomUUID(),
      type: blockType,
      attrs: (node.attrs ?? {}) as Record<string, string | number | boolean | null>,
      content: content.length > 0 ? content : children.length > 0 ? null : [],
      children,
    };
  }

  const blocks: Block[] = [];
  if (pmDoc.content) {
    for (const child of pmDoc.content) {
      const block = convertNode(child);
      if (block) blocks.push(block);
    }
  }

  return { document: { blocks, version: 1 }, warnings, skippedNodes };
}
