export interface FallbackMark {
  mark_type: string;
  attrs: Record<string, unknown>;
}

export interface FallbackSpan {
  text: string;
  marks: FallbackMark[];
}

export interface FallbackBlock {
  id: string;
  block_type: string;
  attrs: Record<string, unknown>;
  content:
    | { type: "RichText"; value: FallbackSpan[] }
    | { type: "Raw"; value: string }
    | { type: "Empty" };
  children: FallbackBlock[];
}

export interface FallbackDoc {
  version: number;
  blocks: FallbackBlock[];
}
