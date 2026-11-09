export { mdOffsetToText, textOffsetToMd } from "./map";
export { fingerprint, isBlockEmpty } from "./model";
export { parseMarkdown } from "./parse";
export { blockToMarkdown, serializeMarkdown } from "./serialize";
export type {
  Block,
  Doc,
  MapBlock,
  MarkdownMap,
  MarkdownSnapshot,
  Mark,
  ParseOptions,
  ParseResult,
  SerializeResult,
  SnapshotBlock,
  SnapshotNode,
  Span,
  TextSegment,
} from "./types";

/**
 * GoTipe node spec for verbatim Markdown fragments (HTML blocks, footnote and
 * link definitions, unsupported constructs). Plain object: register it in the
 * editor schema without depending on `@gotipe/core`.
 */
export const markdownRawNodeSpec = {
  name: "markdownRaw",
  group: ["block"],
  content: "rawText",
  attrs: { kind: { type: "string", default: "" } },
  topLevel: true,
  marksAllowed: "none",
  leaf: true,
  allowsChildren: false,
};
