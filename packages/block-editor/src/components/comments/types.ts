import type { GoTipeEditor } from "@gotipe/core";
export interface ReplyData {
  id: string;
  author: string;
  timestamp: number;
  body: string;
}
export interface CommentData {
  id: string;
  author: string;
  timestamp: number;
  body: string;
  quotedText?: string;
  anchorBlockId?: string;
  anchorFrom?: number;
  anchorTo?: number;
  endBlockId?: string;
  orphaned?: boolean;
  resolved: boolean;
  replies: ReplyData[];
}
export type CommentAction = (id: string) => void | Promise<void>;
export interface CommentSidebarProps {
  editor: GoTipeEditor;
  comments: CommentData[];
  currentUser?: string;
  collapsed?: boolean;
  onAddReply?: (id: string, body: string) => void | Promise<void>;
  onResolve?: CommentAction;
  onUnresolve?: CommentAction;
  onDelete?: CommentAction;
  onToggleCollapse?: () => void;
}
