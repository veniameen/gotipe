import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CommentData {
  id: string;
  author: string;
  timestamp: number;
  body: string;
  quotedText?: string;
  anchorBlockId?: string;
  resolved: boolean;
  replies: ReplyData[];
}

export interface ReplyData {
  id: string;
  author: string;
  timestamp: number;
  body: string;
}

export interface CommentSidebarProps {
  editor: GoTipeEditor;
  comments: CommentData[];
  currentUser?: string;
  collapsed?: boolean;
  onAddReply?: (commentId: string, body: string) => void;
  onResolve?: (commentId: string) => void;
  onUnresolve?: (commentId: string) => void;
  onToggleCollapse?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

/* ------------------------------------------------------------------ */
/*  Single comment thread                                              */
/* ------------------------------------------------------------------ */

interface CommentThreadProps {
  comment: CommentData;
  isActive: boolean;
  currentUser?: string;
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  onUnresolve: (commentId: string) => void;
  onScrollTo: (commentId: string) => void;
}

function CommentThread({
  comment,
  isActive,
  currentUser: _currentUser,
  onReply,
  onResolve,
  onUnresolve,
  onScrollTo,
}: CommentThreadProps) {
  const [replyText, setReplyText] = useState("");
  const [showReplyInput, setShowReplyInput] = useState(false);

  const handleSubmitReply = useCallback(() => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    onReply(comment.id, trimmed);
    setReplyText("");
    setShowReplyInput(false);
  }, [comment.id, replyText, onReply]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmitReply();
      }
    },
    [handleSubmitReply],
  );

  return (
    <div
      className={`gotipe-comment-thread ${isActive ? "active" : ""}`}
      data-comment-id={comment.id}
      style={comment.resolved ? { opacity: 0.6 } : undefined}
    >
      {/* Header: author + timestamp + resolve */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="gotipe-comment-author">{comment.author}</span>
          <span className="gotipe-comment-timestamp">{formatTimestamp(comment.timestamp)}</span>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            type="button"
            aria-label="Scroll to comment"
            onClick={() => onScrollTo(comment.id)}
            style={{
              border: "none",
              background: "transparent",
              color: "var(--gt-text-tertiary)",
              cursor: "pointer",
              fontSize: "12px",
              padding: "2px 4px",
              borderRadius: "var(--gt-radius-sm, 6px)",
            }}
          >
            {"\u2197"}
          </button>
          {comment.resolved ? (
            <button
              type="button"
              aria-label="Unresolve"
              onClick={() => onUnresolve(comment.id)}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--gt-text-tertiary)",
                cursor: "pointer",
                fontSize: "12px",
                padding: "2px 4px",
                borderRadius: "var(--gt-radius-sm, 6px)",
              }}
            >
              Reopen
            </button>
          ) : (
            <button
              type="button"
              aria-label="Resolve"
              onClick={() => onResolve(comment.id)}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--gt-text-tertiary)",
                cursor: "pointer",
                fontSize: "12px",
                padding: "2px 4px",
                borderRadius: "var(--gt-radius-sm, 6px)",
              }}
            >
              Resolve
            </button>
          )}
        </div>
      </div>

      {/* Quoted text */}
      {comment.quotedText && <div className="gotipe-comment-quote">{comment.quotedText}</div>}

      {/* Comment body */}
      <div className="gotipe-comment-body">{comment.body}</div>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div
          style={{
            marginTop: "8px",
            paddingLeft: "12px",
            borderLeft: "2px solid var(--gt-border-light, rgba(0,0,0,0.05))",
          }}
        >
          {comment.replies.map((reply) => (
            <div key={reply.id} style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="gotipe-comment-author">{reply.author}</span>
                <span className="gotipe-comment-timestamp">{formatTimestamp(reply.timestamp)}</span>
              </div>
              <div className="gotipe-comment-body" style={{ marginTop: "4px" }}>
                {reply.body}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      {showReplyInput ? (
        <div style={{ marginTop: "8px" }}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply..."
            rows={2}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid var(--gt-border-light, rgba(0,0,0,0.05))",
              borderRadius: "var(--gt-radius-sm, 6px)",
              background: "var(--gt-bg)",
              color: "var(--gt-text-base)",
              fontSize: "var(--gt-text-sm, 14px)",
              resize: "none",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <div
            style={{ display: "flex", gap: "4px", marginTop: "4px", justifyContent: "flex-end" }}
          >
            <button
              type="button"
              onClick={() => {
                setShowReplyInput(false);
                setReplyText("");
              }}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--gt-text-tertiary)",
                fontSize: "var(--gt-text-xs, 12px)",
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: "var(--gt-radius-sm, 6px)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitReply}
              style={{
                border: "none",
                background: "var(--gt-accent)",
                color: "var(--gt-accent-text, #fff)",
                fontSize: "var(--gt-text-xs, 12px)",
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: "var(--gt-radius-sm, 6px)",
                fontWeight: 600,
              }}
            >
              Reply
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowReplyInput(true)}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--gt-text-tertiary)",
            fontSize: "var(--gt-text-xs, 12px)",
            cursor: "pointer",
            marginTop: "8px",
            padding: "4px 0",
          }}
        >
          Reply
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main sidebar                                                       */
/* ------------------------------------------------------------------ */

export function CommentSidebar({
  editor,
  comments,
  currentUser,
  collapsed = false,
  onAddReply,
  onResolve,
  onUnresolve,
  onToggleCollapse,
}: CommentSidebarProps) {
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const openComments = useMemo(() => comments.filter((c) => !c.resolved), [comments]);
  const resolvedComments = useMemo(() => comments.filter((c) => c.resolved), [comments]);
  const visibleComments = filter === "open" ? openComments : resolvedComments;

  // Navigation state
  const activeIndex = useMemo(() => {
    if (!activeCommentId) return -1;
    return visibleComments.findIndex((c) => c.id === activeCommentId);
  }, [activeCommentId, visibleComments]);

  // Auto-select first comment if none active
  useEffect(() => {
    if (visibleComments.length > 0 && activeIndex === -1) {
      setActiveCommentId(visibleComments[0]!.id);
    }
  }, [visibleComments, activeIndex]);

  const navigatePrev = useCallback(() => {
    if (visibleComments.length === 0) return;
    const newIdx = activeIndex > 0 ? activeIndex - 1 : visibleComments.length - 1;
    setActiveCommentId(visibleComments[newIdx]!.id);
  }, [activeIndex, visibleComments]);

  const navigateNext = useCallback(() => {
    if (visibleComments.length === 0) return;
    const newIdx = activeIndex < visibleComments.length - 1 ? activeIndex + 1 : 0;
    setActiveCommentId(visibleComments[newIdx]!.id);
  }, [activeIndex, visibleComments]);

  // Scroll to active comment in sidebar
  useEffect(() => {
    if (!activeCommentId || !sidebarRef.current) return;
    const el = sidebarRef.current.querySelector(`[data-comment-id="${activeCommentId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeCommentId]);

  // Scroll to anchor text in editor on comment click
  const scrollToAnchor = useCallback(
    (commentId: string) => {
      const comment = comments.find((c) => c.id === commentId);
      if (!comment?.anchorBlockId) return;
      setActiveCommentId(commentId);
      editor.emit("scrollToBlock", { blockId: comment.anchorBlockId });
    },
    [comments, editor],
  );

  const handleReply = useCallback(
    (commentId: string, body: string) => {
      onAddReply?.(commentId, body);
    },
    [onAddReply],
  );

  const handleResolve = useCallback(
    (commentId: string) => {
      onResolve?.(commentId);
    },
    [onResolve],
  );

  const handleUnresolve = useCallback(
    (commentId: string) => {
      onUnresolve?.(commentId);
    },
    [onUnresolve],
  );

  if (collapsed) {
    return (
      <aside
        className="gotipe-comment-sidebar"
        aria-label="Comments"
        style={{ width: "40px", cursor: "pointer" }}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand comments"
          style={{
            width: "100%",
            height: "40px",
            border: "none",
            background: "transparent",
            color: "var(--gt-text-tertiary)",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          {"\u{1F4AC}"}
        </button>
        {openComments.length > 0 && (
          <div
            style={{
              textAlign: "center",
              fontSize: "11px",
              color: "var(--gt-text-tertiary)",
              fontWeight: 600,
            }}
          >
            {openComments.length}
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside ref={sidebarRef} className="gotipe-comment-sidebar" aria-label="Comments">
      <div className="gotipe-comment-sidebar-content">
        {/* Header with collapse + navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--gt-text-tertiary)",
                  cursor: "pointer",
                  fontSize: "14px",
                  padding: "2px",
                }}
              >
                {"\u2715"}
              </button>
            )}
            <span
              style={{
                fontSize: "var(--gt-text-sm, 14px)",
                fontWeight: 600,
                color: "var(--gt-text-base)",
              }}
            >
              Comments
            </span>
          </div>

          {/* Navigation counter */}
          {visibleComments.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                type="button"
                aria-label="Previous comment"
                onClick={navigatePrev}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--gt-text-tertiary)",
                  cursor: "pointer",
                  fontSize: "12px",
                  padding: "2px 4px",
                }}
              >
                {"\u25C4"}
              </button>
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--gt-text-tertiary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {activeIndex >= 0 ? activeIndex + 1 : 0}/{visibleComments.length}
              </span>
              <button
                type="button"
                aria-label="Next comment"
                onClick={navigateNext}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--gt-text-tertiary)",
                  cursor: "pointer",
                  fontSize: "12px",
                  padding: "2px 4px",
                }}
              >
                {"\u25BA"}
              </button>
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "12px" }}>
          <button
            type="button"
            onClick={() => setFilter("open")}
            style={{
              flex: 1,
              padding: "6px 0",
              border: "none",
              borderRadius: "var(--gt-radius-sm, 6px)",
              background: filter === "open" ? "var(--gt-bg-hover)" : "transparent",
              color: filter === "open" ? "var(--gt-text-base)" : "var(--gt-text-tertiary)",
              fontSize: "var(--gt-text-xs, 12px)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Open ({openComments.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("resolved")}
            style={{
              flex: 1,
              padding: "6px 0",
              border: "none",
              borderRadius: "var(--gt-radius-sm, 6px)",
              background: filter === "resolved" ? "var(--gt-bg-hover)" : "transparent",
              color: filter === "resolved" ? "var(--gt-text-base)" : "var(--gt-text-tertiary)",
              fontSize: "var(--gt-text-xs, 12px)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Resolved ({resolvedComments.length})
          </button>
        </div>

        {/* Comment threads */}
        {visibleComments.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--gt-text-tertiary)",
              fontSize: "var(--gt-text-sm, 14px)",
              padding: "24px 0",
            }}
          >
            {filter === "open" ? "No open comments" : "No resolved comments"}
          </div>
        ) : (
          visibleComments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              isActive={comment.id === activeCommentId}
              currentUser={currentUser}
              onReply={handleReply}
              onResolve={handleResolve}
              onUnresolve={handleUnresolve}
              onScrollTo={scrollToAnchor}
            />
          ))
        )}
      </div>
    </aside>
  );
}
