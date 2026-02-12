export type IconName =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "code"
  | "link"
  | "highlight"
  | "superscript"
  | "subscript"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "bulletList"
  | "orderedList"
  | "todoList"
  | "blockquote"
  | "codeBlock"
  | "table"
  | "image"
  | "divider"
  | "callout"
  | "toggle"
  | "columns"
  | "embed"
  | "math"
  | "file"
  | "dragHandle"
  | "plus"
  | "more"
  | "chevronDown"
  | "chevronRight"
  | "undo"
  | "redo"
  | "copy"
  | "cut"
  | "paste"
  | "delete"
  | "duplicate"
  | "moveUp"
  | "moveDown"
  | "indent"
  | "outdent"
  | "search"
  | "replace"
  | "comment"
  | "ai"
  | "check"
  | "close"
  | "external";

export type IconSet = Partial<Record<IconName, string>>;

export interface ThemeConfig {
  name: string;
  tokens?: Record<string, string>;
  componentOverrides?: {
    slotBefore?: string;
    bubbleMenu?: string;
    slashMenu?: string;
    blockHandle?: string;
  };
}

export type ThemePreset = "minimal" | "modern" | "notion" | "docs";
