export interface CommentReply {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Comment {
  id: string;
  blockId: string;
  from: number;
  to: number;
  /** For a selection spanning blocks, `to` is relative to this last block. */
  endBlockId?: string;
  anchor?: TextAnchor;
  quotedText?: string;
  /** The original quote is missing or ambiguous; never highlight guessed text. */
  orphaned?: boolean;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  replies: CommentReply[];
}

export interface CommentThread {
  comment: Comment;
  replies: CommentReply[];
}

export interface CommentsOptions {
  initialState?: unknown;
  /** Host-owned persistence. The value includes quotes and anchors, not DOM state. */
  onChange?: (snapshot: CommentsSnapshot) => void;
  onAdd?: (comment: Comment) => void;
  onResolve?: (commentId: string) => void;
  onDelete?: (commentId: string) => void;
  onReply?: (commentId: string, reply: CommentReply) => void;
}
import type { TextAnchor } from "@gotipe/suggestions";

export interface CommentsSnapshot {
  version: 1;
  comments: Comment[];
}
export interface CommentRange {
  blockId: string;
  from: number;
  to: number;
  endBlockId?: string;
}
