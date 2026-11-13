import type { AttrValue, Document } from "@gotipe/core";

export interface MigrationOptions {
  /** Throw `UnsupportedContent` instead of keeping unsupported content as `markdownRaw`. */
  strict?: boolean;
  /** Called with each warning of the result once the conversion has finished. */
  onWarning?: (message: string) => void;
  blockTypeMap?: Record<string, string>;
  markTypeMap?: Record<string, string>;
  createId?: () => string;
}

/** A source subtree kept as JSON in a `markdownRaw` block because it cannot be converted. */
export interface PreservedSource {
  /** ID of the `markdownRaw` block in the document. */
  blockId: string;
  /** Path of the subtree in the source JSON, such as `content[1]`. */
  path: string;
  /** Source type of the subtree's root node, or `"unknown"`. */
  sourceType: string;
  /** Why it was not converted. */
  reason: string;
}

/** Source fields that are not in the document: the GoTipe schema has no attribute for them. */
export interface UnmappedSource {
  /** Block that holds the converted node, inline element or mark; `null` for the source root. */
  blockId: string | null;
  /** Path of the source object that holds the fields, such as `content[0].attrs`. */
  path: string;
  /** Source type of that node or mark, such as `paragraph` or `link`. */
  sourceType: string;
  /**
   * The fields with their source values. A list or heading that became lines of a table cell's
   * text is one `block` field: the GoTipe block it would have been.
   */
  fields: Record<string, AttrValue>;
}

export interface MigrationResult {
  /** Uses only the node types, attributes and nesting the GoTipe schema declares. */
  document: Document;
  warnings: string[];
  /** Always 0: unsupported content is preserved, never dropped. */
  skippedNodes: number;
  /** Unrecognized subtrees retained verbatim instead of discarded: `preserved.length`. */
  preservedNodes: number;
  preserved: PreservedSource[];
  /** Source fields kept out of `document`, in source order; the root's come first. */
  unmapped: UnmappedSource[];
}
