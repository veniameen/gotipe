import type { BlockView } from "../types/view";

export type AriaRole =
  | "paragraph"
  | "heading"
  | "list"
  | "listitem"
  | "code"
  | "blockquote"
  | "note"
  | "img"
  | "table"
  | "cell"
  | "separator"
  | "region"
  | "figure"
  | "textbox";

export interface BlockA11yConfig {
  role: AriaRole;
  label: string | ((block: BlockView) => string);
  description?: string | ((block: BlockView) => string);
  landmark?: boolean;
}

export const defaultA11yConfigs: Record<string, BlockA11yConfig> = {
  paragraph: { role: "paragraph", label: "Paragraph" },
  heading: {
    role: "heading",
    label: (block) => `Heading level ${block.attrs.level}`,
  },
  codeBlock: {
    role: "code",
    label: (block) => `Code block, language: ${block.attrs.language || "plain text"}`,
    description: "Press Escape to exit code block",
  },
  image: {
    role: "img",
    label: (block) => (block.attrs.alt as string) || "Image without description",
  },
  table: {
    role: "table",
    label: "Table",
    description: (block) => {
      const rows = block.children?.length ?? 0;
      const cols = block.children?.[0]?.children?.length ?? 0;
      return `${rows} rows, ${cols} columns`;
    },
  },
  bulletList: { role: "list", label: "Bullet list" },
  orderedList: { role: "list", label: "Numbered list" },
  listItem: { role: "listitem", label: "List item" },
  blockquote: { role: "blockquote", label: "Blockquote" },
  callout: { role: "note", label: (block) => `${block.attrs.emoji} Callout` },
  divider: { role: "separator", label: "Divider" },
  toggle: {
    role: "region",
    label: "Toggle block",
    description: (block) => (block.attrs.open ? "Expanded" : "Collapsed"),
  },
  embed: {
    role: "figure",
    label: (block) => `Embedded content: ${block.attrs.type || "unknown"}`,
  },
  math: { role: "figure", label: "Mathematical equation" },
  file: {
    role: "figure",
    label: (block) => `File attachment: ${block.attrs.name || "unknown"}`,
  },
  columns: { role: "region", label: "Columns layout" },
  column: { role: "region", label: "Column" },
  tableCell: { role: "cell", label: "Table cell" },
  tableHeader: { role: "cell", label: "Table header cell" },
};
