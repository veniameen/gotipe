import { type GoTipeEditor, GoTipeError, createId } from "@gotipe/core";
import {
  type DocumentText,
  captureRange,
  commentDecorations,
  documentText,
  resolveComment,
} from "./anchors";
import { followChange } from "./follow";
import { decodeCommentsSnapshot, nonempty } from "./persistence";
import type {
  Comment,
  CommentRange,
  CommentReply,
  CommentsOptions,
  CommentsSnapshot,
} from "./types";

type EditorPort = Pick<
  GoTipeEditor,
  "getJSON" | "on" | "emit" | "setDecorations" | "reportError" | "isDestroyed"
>;
export class CommentsManager {
  private comments = new Map<string, Comment>();
  private listeners = new Set<() => void>();
  private destroyed = false;
  private cleanup: (() => void)[];
  private layer = `comments-${createId()}`;
  private resolvedIn: DocumentText | null = null;

  constructor(
    private editor: EditorPort,
    private options: CommentsOptions = {},
  ) {
    this.cleanup = [
      editor.on("update", () => this.reanchor()),
      editor.on("destroy", () => this.destroy()),
    ];
    if (options.initialState !== undefined) {
      try {
        this.loadState(options.initialState);
      } catch (error) {
        this.destroy();
        throw error;
      }
    }
  }
  private assertLive(): void {
    if (this.destroyed || this.editor.isDestroyed)
      throw new GoTipeError("COMMENT_ACTION_FAILED", "The comments manager was destroyed");
  }
  private call(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      this.editor.reportError(
        new GoTipeError(
          "COMMENT_ACTION_FAILED",
          error instanceof Error ? error.message : "Comment callback failed",
        ),
      );
    }
  }
  private refresh(view?: DocumentText): void {
    if (this.destroyed || this.editor.isDestroyed) return;
    const comments = Array.from(this.comments.values());
    const text = comments.length ? (view ?? documentText(this.editor.getJSON())) : null;
    this.editor.setDecorations(
      this.layer,
      text ? comments.flatMap((comment) => commentDecorations(comment, text)) : [],
    );
  }
  private changed(view?: DocumentText): void {
    this.refresh(view);
    for (const listener of this.listeners) this.call(listener);
    this.call(() => this.options.onChange?.(this.exportState()));
  }
  private reanchor(): void {
    if (this.destroyed || this.editor.isDestroyed) return;
    if (!this.comments.size) {
      this.resolvedIn = null;
      this.refresh();
      return;
    }
    const view = documentText(this.editor.getJSON());
    // resolvedIn is the text the comments were last resolved in: this update follows them from it.
    const change = this.resolvedIn && {
      previous: this.resolvedIn,
      follow: followChange(this.resolvedIn.text, view.text),
    };
    this.resolvedIn = view;
    let changed = false;
    for (const [id, comment] of this.comments) {
      const next = resolveComment(comment, view, change ?? undefined);
      if (JSON.stringify(next) !== JSON.stringify(comment)) {
        this.comments.set(id, next);
        changed = true;
      }
    }
    if (changed) this.changed(view);
    else this.refresh(view);
  }
  subscribe(listener: () => void): () => void {
    this.assertLive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  addComment(
    options: CommentRange & { authorId: string; authorName: string; content: string },
  ): Comment {
    this.assertLive();
    const view = documentText(this.editor.getJSON());
    const comment: Comment = {
      id: createId(),
      ...captureRange(view, options),
      authorId: nonempty(options.authorId, "Author ID"),
      authorName: nonempty(options.authorName, "Author name"),
      content: nonempty(options.content, "Comment"),
      createdAt: new Date().toISOString(),
      resolved: false,
      replies: [],
    };
    this.comments.set(comment.id, comment);
    this.resolvedIn = view;
    this.changed(view);
    this.editor.emit("commentAdded", comment.id);
    this.call(() => this.options.onAdd?.(structuredClone(comment)));
    return structuredClone(comment);
  }
  updateComment(id: string, content: string): boolean {
    this.assertLive();
    const comment = this.comments.get(id);
    if (!comment) return false;
    comment.content = nonempty(content, "Comment");
    comment.updatedAt = new Date().toISOString();
    this.changed();
    this.editor.emit("commentUpdated", id);
    return true;
  }
  reanchorComment(id: string, range: CommentRange): boolean {
    this.assertLive();
    const comment = this.comments.get(id);
    if (!comment) return false;
    const view = documentText(this.editor.getJSON());
    Object.assign(comment, captureRange(view, range), {
      endBlockId: range.endBlockId,
      updatedAt: new Date().toISOString(),
    });
    this.resolvedIn = view;
    this.changed(view);
    this.editor.emit("commentUpdated", id);
    return true;
  }
  resolveComment(id: string, resolvedBy: string): void {
    this.assertLive();
    const comment = this.comments.get(id);
    if (!comment || comment.resolved) return;
    comment.resolvedBy = nonempty(resolvedBy, "Resolving author");
    comment.resolved = true;
    comment.resolvedAt = new Date().toISOString();
    this.changed();
    this.editor.emit("commentResolved", id);
    this.call(() => this.options.onResolve?.(id));
  }
  unresolveComment(id: string): void {
    this.assertLive();
    const comment = this.comments.get(id);
    if (!comment || !comment.resolved) return;
    comment.resolved = false;
    comment.resolvedBy = undefined;
    comment.resolvedAt = undefined;
    this.changed();
    this.editor.emit("commentUpdated", id);
  }
  deleteComment(id: string): void {
    this.assertLive();
    if (!this.comments.delete(id)) return;
    this.changed();
    this.editor.emit("commentDeleted", id);
    this.call(() => this.options.onDelete?.(id));
  }
  addReply(
    id: string,
    options: { authorId: string; authorName: string; content: string },
  ): CommentReply | null {
    this.assertLive();
    const comment = this.comments.get(id);
    if (!comment) return null;
    const reply: CommentReply = {
      id: createId(),
      authorId: nonempty(options.authorId, "Author ID"),
      authorName: nonempty(options.authorName, "Author name"),
      content: nonempty(options.content, "Reply"),
      createdAt: new Date().toISOString(),
    };
    comment.replies.push(reply);
    this.changed();
    this.editor.emit("commentUpdated", id);
    this.call(() => this.options.onReply?.(id, structuredClone(reply)));
    return structuredClone(reply);
  }
  updateReply(id: string, replyId: string, content: string): boolean {
    this.assertLive();
    const reply = this.comments.get(id)?.replies.find((entry) => entry.id === replyId);
    if (!reply) return false;
    reply.content = nonempty(content, "Reply");
    reply.updatedAt = new Date().toISOString();
    this.changed();
    this.editor.emit("commentUpdated", id);
    return true;
  }
  deleteReply(id: string, replyId: string): boolean {
    this.assertLive();
    const comment = this.comments.get(id);
    const index = comment?.replies.findIndex((entry) => entry.id === replyId) ?? -1;
    if (!comment || index < 0) return false;
    comment.replies.splice(index, 1);
    this.changed();
    this.editor.emit("commentUpdated", id);
    return true;
  }
  getComment(id: string): Comment | undefined {
    const comment = this.comments.get(id);
    return comment ? structuredClone(comment) : undefined;
  }
  getComments(): Comment[] {
    return structuredClone(Array.from(this.comments.values()));
  }
  getCommentsForBlock(id: string): Comment[] {
    return this.getComments().filter(
      (comment) => comment.blockId === id || comment.endBlockId === id,
    );
  }
  getUnresolvedComments(): Comment[] {
    return this.getComments().filter((comment) => !comment.resolved);
  }
  exportState(): CommentsSnapshot {
    this.assertLive();
    return { version: 1, comments: this.getComments() };
  }
  loadState(value: unknown): void {
    this.assertLive();
    const snapshot = decodeCommentsSnapshot(value);
    const view = documentText(this.editor.getJSON());
    const comments = snapshot.comments.map((comment) => resolveComment(comment, view));
    this.comments = new Map(comments.map((comment) => [comment.id, comment]));
    this.resolvedIn = view;
    this.changed(view);
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const stop of this.cleanup) stop();
    this.cleanup = [];
    if (!this.editor.isDestroyed) this.editor.setDecorations(this.layer, []);
    this.comments.clear();
    this.resolvedIn = null;
    this.listeners.clear();
  }
}
