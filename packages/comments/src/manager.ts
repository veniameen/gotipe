import type { GoTipeEditor } from "@gotipe/core";
import type { Comment, CommentReply } from "./types";

export class CommentsManager {
  private comments = new Map<string, Comment>();

  constructor(private editor: GoTipeEditor) {}

  addComment(options: {
    blockId: string;
    from: number;
    to: number;
    authorId: string;
    authorName: string;
    content: string;
  }): Comment {
    const comment: Comment = {
      id: crypto.randomUUID(),
      blockId: options.blockId,
      from: options.from,
      to: options.to,
      authorId: options.authorId,
      authorName: options.authorName,
      content: options.content,
      createdAt: new Date().toISOString(),
      resolved: false,
      replies: [],
    };

    this.comments.set(comment.id, comment);
    this.editor.emit("commentAdded", comment.id);
    return comment;
  }

  resolveComment(commentId: string, resolvedBy: string): void {
    const comment = this.comments.get(commentId);
    if (comment) {
      comment.resolved = true;
      comment.resolvedBy = resolvedBy;
      comment.resolvedAt = new Date().toISOString();
      this.editor.emit("commentResolved", commentId);
    }
  }

  unresolveComment(commentId: string): void {
    const comment = this.comments.get(commentId);
    if (comment) {
      comment.resolved = false;
      comment.resolvedBy = undefined;
      comment.resolvedAt = undefined;
    }
  }

  deleteComment(commentId: string): void {
    this.comments.delete(commentId);
    this.editor.emit("commentDeleted", commentId);
  }

  addReply(
    commentId: string,
    options: { authorId: string; authorName: string; content: string },
  ): CommentReply | null {
    const comment = this.comments.get(commentId);
    if (!comment) return null;

    const reply: CommentReply = {
      id: crypto.randomUUID(),
      authorId: options.authorId,
      authorName: options.authorName,
      content: options.content,
      createdAt: new Date().toISOString(),
    };

    comment.replies.push(reply);
    this.editor.emit("commentUpdated", commentId);
    return reply;
  }

  getComment(commentId: string): Comment | undefined {
    return this.comments.get(commentId);
  }

  getComments(): Comment[] {
    return Array.from(this.comments.values());
  }

  getCommentsForBlock(blockId: string): Comment[] {
    return this.getComments().filter((c) => c.blockId === blockId);
  }

  getUnresolvedComments(): Comment[] {
    return this.getComments().filter((c) => !c.resolved);
  }

  destroy(): void {
    this.comments.clear();
  }
}
