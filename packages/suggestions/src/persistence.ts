import { type Document, GoTipeError, type Mark, decodeDocument } from "@gotipe/core";
import type { TextAnchor } from "./anchors";
import { type TrackedChange, createTrackedChange } from "./tracking/change";
import type { Suggestion } from "./types";

export interface SuggestionsSnapshot {
  version: 1;
  records: {
    suggestion: Suggestion;
    anchor?: TextAnchor;
    change?: { before: Document; after: Document };
  }[];
}
export interface LoadedSuggestion {
  suggestion: Suggestion;
  anchor?: TextAnchor;
  change?: TrackedChange;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new GoTipeError("VALIDATION_ERROR", "Expected a review record object");
  return value as Record<string, unknown>;
}
function text(value: unknown, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value) || value.length > 10000000)
    throw new GoTipeError("VALIDATION_ERROR", "Invalid review text");
  return value;
}
function offset(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new GoTipeError("VALIDATION_ERROR", "Invalid review offset");
  return value;
}
function marks(value: unknown): Mark[] {
  if (!Array.isArray(value)) throw new GoTipeError("VALIDATION_ERROR", "Invalid review marks");
  const content = decodeDocument({
    blocks: [{ id: "marks", type: "paragraph", content: [{ text: "", marks: value }] }],
  }).blocks[0]!.content;
  if (!Array.isArray(content)) throw new GoTipeError("VALIDATION_ERROR", "Invalid review marks");
  return content[0]!.marks;
}
function suggestion(value: unknown): Suggestion {
  const source = object(value);
  const type = source.type;
  const status = source.status;
  if (
    type !== "insert" &&
    type !== "delete" &&
    type !== "replace" &&
    type !== "format" &&
    type !== "structure"
  )
    throw new GoTipeError("VALIDATION_ERROR", "Invalid suggestion type");
  if (status !== "pending" && status !== "accepted" && status !== "rejected")
    throw new GoTipeError("VALIDATION_ERROR", "Invalid suggestion status");
  if (source.applied !== undefined && typeof source.applied !== "boolean")
    throw new GoTipeError("VALIDATION_ERROR", "Invalid applied state");
  const result: Suggestion = {
    id: text(source.id),
    type,
    status,
    blockId: text(source.blockId),
    from: offset(source.from),
    to: offset(source.to),
    authorId: text(source.authorId),
    authorName: text(source.authorName),
    createdAt: text(source.createdAt),
  };
  if (result.to < result.from || !Number.isFinite(Date.parse(result.createdAt)))
    throw new GoTipeError("VALIDATION_ERROR", "Invalid suggestion range or date");
  if (source.applied !== undefined) result.applied = source.applied;
  if (source.newContent !== undefined) result.newContent = text(source.newContent, true);
  if (source.originalContent !== undefined)
    result.originalContent = text(source.originalContent, true);
  if (source.marks !== undefined) result.marks = marks(source.marks);
  if (source.format !== undefined) {
    const format = object(source.format);
    result.format = {};
    if (format.add !== undefined) result.format.add = marks(format.add);
    if (format.remove !== undefined) {
      if (!Array.isArray(format.remove))
        throw new GoTipeError("VALIDATION_ERROR", "Invalid removed mark list");
      result.format.remove = format.remove.map((entry) => text(entry));
    }
  }
  return result;
}
export function decodeSuggestionsSnapshot(value: unknown): LoadedSuggestion[] {
  const source = object(value);
  if (source.version !== 1 || !Array.isArray(source.records) || source.records.length > 10000)
    throw new GoTipeError("VALIDATION_ERROR", "Unsupported suggestions snapshot");
  const ids = new Set<string>();
  return source.records.map((value): LoadedSuggestion => {
    const entry = object(value);
    const proposal = suggestion(entry.suggestion);
    if (ids.has(proposal.id)) throw new GoTipeError("VALIDATION_ERROR", "Duplicate suggestion ID");
    ids.add(proposal.id);
    if (proposal.applied) {
      const saved = object(entry.change);
      const change = createTrackedChange(decodeDocument(saved.before), decodeDocument(saved.after));
      if (!change)
        throw new GoTipeError("VALIDATION_ERROR", "Tracked snapshot has no document change");
      return { suggestion: proposal, change };
    }
    if (proposal.type === "structure")
      throw new GoTipeError("VALIDATION_ERROR", "Structural proposal requires a captured change");
    const anchor = object(entry.anchor);
    return {
      suggestion: proposal,
      anchor: {
        before: text(anchor.before, true),
        quote: text(anchor.quote, true),
        after: text(anchor.after, true),
      },
    };
  });
}
export function serializeTrackedChange(change: TrackedChange): {
  before: Document;
  after: Document;
} {
  return change.kind === "structure"
    ? { before: change.before, after: change.after }
    : {
        before: { version: 1, blocks: change.before },
        after: { version: 1, blocks: change.after },
      };
}
