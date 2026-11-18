/** A mark applied to a span of text (bold, italic, link, ...). */
export interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

/** A run of text sharing the same set of marks. */
export interface Span {
  text: string;
  marks: Mark[];
}

/** GoTipe block (JS document format). */
export interface Block {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  /** Rich text (`Span[]`), raw text (`string`) or no content (`null`). */
  content: Span[] | string | null;
  children: Block[];
}

/** GoTipe document (JS format). */
export interface Doc {
  version: number;
  blocks: Block[];
}

/**
 * Maps a range of a block's flat text (concatenated span texts, or the raw
 * string of a code block) to a range of the Markdown source.
 */
export interface TextSegment {
  blockId: string;
  textFrom: number;
  textTo: number;
  mdFrom: number;
  mdTo: number;
  /** `true` when every char of the text range maps 1:1 to the Markdown range. */
  exact: boolean;
}

/** Source range of a block (any depth) in the Markdown text. */
export interface MapBlock {
  blockId: string;
  start: number;
  end: number;
  depth: number;
}

export interface MarkdownMap {
  /** Every block including nested ones, in document order; md offsets in the serialized text. */
  blocks: MapBlock[];
  /** Text segments sorted by `mdFrom`. */
  segments: TextSegment[];
}

/** Nested block range inside a top-level block (offsets relative to the top-level block start). */
export interface SnapshotNode {
  id: string;
  type: string;
  start: number;
  end: number;
  children: SnapshotNode[];
}

/** One top-level block of a snapshot. */
export interface SnapshotBlock {
  id: string;
  type: string;
  /** Absolute offsets of the block's source slice in `MarkdownSnapshot.text`. */
  start: number;
  end: number;
  /** Canonical fingerprint (stable JSON of the block without ids). */
  fingerprint: string;
  /** The block itself and its nested blocks (offsets relative to `start`). */
  tree: SnapshotNode;
  /** Text segments of the block and its nested blocks (md offsets relative to `start`). */
  segments: TextSegment[];
}

/**
 * Everything needed to re-emit untouched blocks verbatim. JSON-serializable.
 */
export interface MarkdownSnapshot {
  version: 1;
  /** Full Markdown text this snapshot describes. */
  text: string;
  /** `"﻿"` when the file starts with a byte order mark, else `""`. */
  bom: string;
  /** Front matter block (`---` ... `---`/`...`) at offset 0, verbatim incl. its line break, or `""`. */
  frontMatter: string;
  /** Line break style: the first line break of the file, `"\n"` by default. */
  eol: string;
  /** Text between the front matter and the first block (whole remainder when there are no blocks). */
  leading: string;
  blocks: SnapshotBlock[];
  /** `gaps[i]` is the text between `blocks[i]` and `blocks[i + 1]`. */
  gaps: string[];
  /** Text after the last block. */
  trailing: string;
}

/**
 * Inline atoms a reader may produce: text with an atomic mark whose text is the fallback.
 * Each one is off unless asked for, so a document only gets the marks its editor declares.
 */
export interface InlineAtoms {
  /** `[@Anna](mention:user-42)` is text with a `mention` mark (`id`, `kind`, `label`). */
  mention?: boolean;
  /** `$x^2$` is the TeX source with an `inlineMath` mark. */
  inlineMath?: boolean;
  /** `![alt](src)` among other inline content is the alt text with an `inlineImage` mark. */
  inlineImage?: boolean;
  /** Registered names and their image addresses: `:name:` is text with a `customEmoji` mark. */
  customEmoji?: Record<string, string>;
}

export interface ParseOptions {
  /** Snapshot of the previous version of the file: ids are reused for matching blocks. */
  previous?: MarkdownSnapshot;
  /** Previous document: used for id reuse when no `previous` snapshot is given. */
  previousDoc?: Doc;
  /** Id factory for new blocks (default: UUID v7). */
  createId?: () => string;
  /** Inline atoms to read; without it mentions, formulas, emoji and inline images stay as before. */
  atoms?: InlineAtoms;
}

export interface ParseResult {
  doc: Doc;
  snapshot: MarkdownSnapshot;
}

export interface SerializeOptions {
  /**
   * Fingerprints of top-level blocks kept between calls, by block object. Pass the same map to
   * every call only for documents whose blocks are never changed in place (a changed block is a
   * new object, as in an editor's view): a block seen before is not fingerprinted again. The
   * written text is the same with and without it.
   */
  fingerprints?: WeakMap<object, string>;
}

export interface SerializeResult {
  text: string;
  snapshot: MarkdownSnapshot;
  map: MarkdownMap;
}

/** Internal: a segment without block id (offsets relative to some origin). */
export interface RawSegment {
  textFrom: number;
  textTo: number;
  mdFrom: number;
  mdTo: number;
  exact: boolean;
}
