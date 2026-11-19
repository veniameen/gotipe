export { mdOffsetToText, textOffsetToMd, textRangeToMd } from "./map";
export { fingerprint, isBlockEmpty } from "./model";
export { parseMarkdown } from "./parse";
export { blockToMarkdown, serializeMarkdown } from "./serialize";
export type {
  Block,
  Doc,
  InlineAtoms,
  MapBlock,
  MarkdownMap,
  MarkdownSnapshot,
  Mark,
  ParseOptions,
  ParseResult,
  SerializeOptions,
  SerializeResult,
  SnapshotBlock,
  SnapshotNode,
  Span,
  TextSegment,
} from "./types";

/** `AttrSpec` of `@gotipe/core`, see `NodeSpec`. */
interface AttrSpec {
  type: "string" | "number" | "bool" | "enum" | "array" | "object";
  values?: string[];
  default?: unknown;
  required?: boolean;
}

/**
 * `NodeSpec` of `@gotipe/core`, repeated: core depends on this package, so this package
 * cannot import it. A value of this type is a core `NodeSpec` for TypeScript.
 */
interface NodeSpec {
  name: string;
  group: string[];
  content: "richText" | "rawText" | "empty";
  attrs: Record<string, AttrSpec>;
  topLevel: boolean;
  marksAllowed: "all" | "none" | string[];
  leaf: boolean;
  allowsChildren: boolean;
  childTypes?: string[];
}

/**
 * GoTipe node spec for verbatim Markdown fragments (HTML blocks, footnote and
 * link definitions, unsupported constructs). Pass it to `defineExtension` of
 * `@gotipe/core` as is; this package does not depend on core.
 */
export const markdownRawNodeSpec: NodeSpec = {
  name: "markdownRaw",
  group: ["block"],
  content: "rawText",
  attrs: { kind: { type: "string", default: "" } },
  topLevel: true,
  marksAllowed: "none",
  leaf: true,
  allowsChildren: false,
};
