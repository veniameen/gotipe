/** Syntax nodes used by our Markdown reader. All offsets are UTF-16 source offsets. */
export interface Position {
  start: { offset: number };
  end: { offset: number };
}

interface Node<T extends string> {
  type: T;
  position?: Position;
}
export interface Text extends Node<"text"> {
  value: string;
  /**
   * Text of a backslash escape or a character reference while the inline reader runs: as in
   * GFM it is never part of an autolink literal, so `www\.a.b` stays text (D-97).
   */
  decoded?: true;
}
export interface InlineCode extends Node<"inlineCode"> {
  value: string;
}
export interface Break extends Node<"break"> {}
export interface Html extends Node<"html"> {
  value: string;
}
export interface Emphasis extends Node<"emphasis" | "strong" | "delete"> {
  children: PhrasingContent[];
}
export interface Link extends Node<"link"> {
  url: string;
  title?: string | null;
  children: PhrasingContent[];
}
export interface Image extends Node<"image"> {
  url: string;
  title?: string | null;
  alt: string;
}
export interface Reference extends Node<"linkReference" | "imageReference" | "footnoteReference"> {
  value: string;
}
/** `$…$`: TeX taken as written, when the reader is asked for inline formulas. */
export interface InlineMath extends Node<"inlineMath"> {
  value: string;
}
/** `:name:` of a registered custom emoji; `value` is the source text. */
export interface Emoji extends Node<"emoji"> {
  value: string;
  name: string;
}
export type PhrasingContent =
  | Text
  | InlineCode
  | Break
  | Html
  | Emphasis
  | Link
  | Image
  | Reference
  | InlineMath
  | Emoji;
export interface Paragraph extends Node<"paragraph"> {
  children: PhrasingContent[];
}
export interface Heading extends Node<"heading"> {
  depth: number;
  children: PhrasingContent[];
}
export interface Code extends Node<"code"> {
  value: string;
  lang?: string | null;
  meta?: string | null;
}
export interface Blockquote extends Node<"blockquote"> {
  children: RootContent[];
}
export interface ListItem extends Node<"listItem"> {
  children: RootContent[];
  checked?: boolean | null;
  spread?: boolean;
}
export interface List extends Node<"list"> {
  children: ListItem[];
  ordered: boolean;
  start?: number | null;
  spread?: boolean;
}
export interface TableCell extends Node<"tableCell"> {
  children: PhrasingContent[];
}
export interface TableRow extends Node<"tableRow"> {
  children: TableCell[];
}
export interface Table extends Node<"table"> {
  children: TableRow[];
  align: ("left" | "right" | "center" | null)[];
  /** Its head row ended a paragraph: a lazy line there continues the paragraph's text (D-216). */
  afterText?: boolean;
}
export interface ThematicBreak extends Node<"thematicBreak"> {}
/** A `$$` block: TeX between `$$` lines, taken as written. */
export interface MathBlock extends Node<"math"> {
  value: string;
}
export interface Definition extends Node<"definition" | "footnoteDefinition"> {
  value: string;
}
export type RootContent =
  | Paragraph
  | Heading
  | Code
  | Blockquote
  | List
  | Table
  | ThematicBreak
  | MathBlock
  | Html
  | Definition;
export type Nodes = RootContent | PhrasingContent | ListItem | TableRow | TableCell;
export interface Root {
  type: "root";
  children: RootContent[];
}

export const position = (start: number, end: number): Position => ({
  start: { offset: start },
  end: { offset: end },
});
