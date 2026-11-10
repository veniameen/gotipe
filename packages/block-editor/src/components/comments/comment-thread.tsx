import { useEffect, useRef, useState } from "react";
import type { CommentData, CommentSidebarProps } from "./types";

type Props = Pick<
  CommentSidebarProps,
  "currentUser" | "onAddReply" | "onResolve" | "onUnresolve" | "onDelete"
> & { comment: CommentData; active: boolean; onLocate: (comment: CommentData) => void };
export function CommentThread({
  comment,
  active,
  currentUser,
  onAddReply,
  onResolve,
  onUnresolve,
  onDelete,
  onLocate,
}: Props) {
  const [reply, setReply] = useState("");
  const [replyOpen, setReplyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const replyInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (replyOpen) replyInput.current?.focus();
  }, [replyOpen]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = async (action: () => void | Promise<void>, done?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      if (alive.current) done?.();
    } catch (failure) {
      if (alive.current)
        setError(failure instanceof Error ? failure.message : "The comment could not be updated.");
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const submitReply = () => {
    const text = reply.trim();
    if (!text || !onAddReply) return;
    void run(
      () => onAddReply(comment.id, text),
      () => {
        setReply("");
        setReplyOpen(false);
      },
    );
  };
  return (
    <article
      className={`gotipe-comment-thread${active ? " active" : ""}`}
      data-comment-id={comment.id}
      aria-busy={busy}
    >
      <div className="gotipe-comment-heading">
        <span className="gotipe-comment-author">{comment.author}</span>
        <time
          className="gotipe-comment-timestamp"
          dateTime={new Date(comment.timestamp).toISOString()}
        >
          {new Date(comment.timestamp).toLocaleString()}
        </time>
      </div>
      {comment.quotedText && (
        <blockquote className="gotipe-comment-quote">{comment.quotedText}</blockquote>
      )}
      {comment.orphaned && (
        <p className="gotipe-comment-orphaned">The quoted text has changed or was removed.</p>
      )}
      <p className="gotipe-comment-body">{comment.body}</p>
      <div className="gotipe-comment-actions">
        {comment.anchorBlockId && (
          <button
            type="button"
            disabled={comment.orphaned}
            aria-label="Scroll to comment"
            onClick={() => onLocate(comment)}
          >
            Show quote
          </button>
        )}
        {comment.resolved
          ? onUnresolve && (
              <button
                type="button"
                disabled={busy}
                aria-label="Unresolve"
                onClick={() => void run(() => onUnresolve(comment.id))}
              >
                Reopen
              </button>
            )
          : onResolve && (
              <button
                type="button"
                disabled={busy}
                aria-label="Resolve"
                onClick={() => void run(() => onResolve(comment.id))}
              >
                Resolve
              </button>
            )}
        {onDelete && (
          <button
            type="button"
            disabled={busy}
            aria-label="Delete comment"
            onClick={() => void run(() => onDelete(comment.id))}
          >
            Delete
          </button>
        )}
      </div>
      {!!comment.replies.length && (
        <ol className="gotipe-comment-replies">
          {comment.replies.map((entry) => (
            <li key={entry.id}>
              <div className="gotipe-comment-heading">
                <span className="gotipe-comment-author">{entry.author}</span>
                <time
                  className="gotipe-comment-timestamp"
                  dateTime={new Date(entry.timestamp).toISOString()}
                >
                  {new Date(entry.timestamp).toLocaleString()}
                </time>
              </div>
              <p className="gotipe-comment-body">{entry.body}</p>
            </li>
          ))}
        </ol>
      )}
      {onAddReply &&
        (replyOpen ? (
          <form
            className="gotipe-comment-reply-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitReply();
            }}
          >
            <label>
              Reply{currentUser ? ` as ${currentUser}` : ""}
              <textarea
                aria-label="Reply"
                ref={replyInput}
                rows={3}
                maxLength={10000}
                value={reply}
                disabled={busy}
                onChange={(event) => setReply(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key === "Enter" &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    submitReply();
                  }
                  if (event.key === "Escape") setReplyOpen(false);
                }}
                placeholder="Reply..."
              />
            </label>
            <div className="gotipe-comment-actions">
              <button type="submit" disabled={busy || !reply.trim()}>
                Send reply
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setReply("");
                  setReplyOpen(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="gotipe-comment-reply-button"
            disabled={busy}
            onClick={() => setReplyOpen(true)}
          >
            Reply
          </button>
        ))}
      {error && (
        <p role="alert" className="gotipe-comment-error">
          {error}
        </p>
      )}
    </article>
  );
}
