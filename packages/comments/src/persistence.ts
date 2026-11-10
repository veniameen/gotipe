import { GoTipeError } from "@gotipe/core";
import type { Comment, CommentReply, CommentsSnapshot } from "./types";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new GoTipeError("VALIDATION_ERROR", "Invalid comment record");
  return value as Record<string, unknown>;
}
export function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 100000)
    throw new GoTipeError(
      "COMMENT_ACTION_FAILED",
      `${label} must contain text (at most 100000 characters)`,
    );
  return value.trim();
}
function date(value: unknown): string {
  const result = nonempty(value, "Date");
  if (!Number.isFinite(Date.parse(result)))
    throw new GoTipeError("VALIDATION_ERROR", "Invalid comment date");
  return result;
}
function offset(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new GoTipeError("VALIDATION_ERROR", "Invalid comment offset");
  return value;
}
function reply(value: unknown): CommentReply {
  const entry = object(value);
  return {
    id: nonempty(entry.id, "Reply ID"),
    authorId: nonempty(entry.authorId, "Author ID"),
    authorName: nonempty(entry.authorName, "Author name"),
    content: nonempty(entry.content, "Reply"),
    createdAt: date(entry.createdAt),
    ...(entry.updatedAt !== undefined ? { updatedAt: date(entry.updatedAt) } : {}),
  };
}
export function decodeCommentsSnapshot(value: unknown): CommentsSnapshot {
  const source = object(value);
  if (source.version !== 1 || !Array.isArray(source.comments) || source.comments.length > 10000)
    throw new GoTipeError("VALIDATION_ERROR", "Unsupported comments snapshot");
  const ids = new Set<string>();
  const comments = source.comments.map((value): Comment => {
    const entry = object(value);
    const base = reply(entry);
    if (ids.has(base.id)) throw new GoTipeError("VALIDATION_ERROR", "Duplicate comment ID");
    ids.add(base.id);
    if (
      typeof entry.resolved !== "boolean" ||
      !Array.isArray(entry.replies) ||
      entry.replies.length > 10000
    )
      throw new GoTipeError("VALIDATION_ERROR", "Invalid comment thread");
    const comment: Comment = {
      ...base,
      blockId: nonempty(entry.blockId, "Block ID"),
      from: offset(entry.from),
      to: offset(entry.to),
      resolved: entry.resolved,
      replies: entry.replies.map(reply),
    };
    const replyIds = new Set<string>();
    for (const item of comment.replies) {
      if (replyIds.has(item.id)) throw new GoTipeError("VALIDATION_ERROR", "Duplicate reply ID");
      replyIds.add(item.id);
    }
    if (entry.endBlockId !== undefined)
      comment.endBlockId = nonempty(entry.endBlockId, "End block ID");
    if (
      (!comment.endBlockId || comment.endBlockId === comment.blockId) &&
      comment.to < comment.from
    )
      throw new GoTipeError("VALIDATION_ERROR", "Reversed comment range");
    if (entry.resolvedBy !== undefined)
      comment.resolvedBy = nonempty(entry.resolvedBy, "Resolving author");
    if (entry.resolvedAt !== undefined) comment.resolvedAt = date(entry.resolvedAt);
    if (entry.anchor !== undefined) {
      const anchor = object(entry.anchor);
      for (const key of ["before", "quote", "after"])
        if (typeof anchor[key] !== "string")
          throw new GoTipeError("VALIDATION_ERROR", "Invalid comment anchor");
      comment.anchor = {
        before: anchor.before as string,
        quote: anchor.quote as string,
        after: anchor.after as string,
      };
      comment.quotedText = comment.anchor.quote;
    }
    return comment;
  });
  return { version: 1, comments };
}
