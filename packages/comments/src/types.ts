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
  onAdd?: (comment: Comment) => void;
  onResolve?: (commentId: string) => void;
  onDelete?: (commentId: string) => void;
  onReply?: (commentId: string, reply: CommentReply) => void;
}
