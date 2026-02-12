export type AttrValue = string | number | boolean | null;

export interface Mark {
  type: string;
  attrs: Record<string, AttrValue>;
}

export interface TextSpan {
  text: string;
  marks: Mark[];
}

export type BlockContent = TextSpan[] | string | null;

export interface Block {
  id: string;
  type: string;
  attrs: Record<string, AttrValue>;
  content: BlockContent;
  children: Block[];
}

export interface Document {
  blocks: Block[];
  version: number;
}
