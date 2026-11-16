import { useEffect, useRef, useState } from "react";
import { useBlockEditorI18n } from "../../i18n/strings";
import type { CommentData, CommentSidebarProps } from "./types";

type Props = Pick<
  CommentSidebarProps,
  "currentUser" | "onAddReply" | "onResolve" | "onUnresolve" | "onDelete"
> & { comment: CommentData; active: boolean; onLocate: (comment: CommentData) => void };

/**
 * When a comment or a reply was written, in the interface's language rather than the
 * browser's (D-197). A locale name that is no language tag (`de_DE`) keeps the browser's.
 */
function Stamp({ timestamp, locale }: { timestamp: number; locale: string }) {
  const date = new Date(timestamp);
  let text: string;
  try {
    text = date.toLocaleString(locale);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    text = date.toLocaleString();
  }
  return (
    <time className="gotipe-comment-timestamp" dateTime={date.toISOString()}>
      {text}
    </time>
  );
}

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
  const i18n = useBlockEditorI18n();
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
        setError(failure instanceof Error ? failure.message : i18n.t("error.comment"));
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
        <Stamp timestamp={comment.timestamp} locale={i18n.locale} />
      </div>
      {comment.quotedText && (
        <blockquote className="gotipe-comment-quote">{comment.quotedText}</blockquote>
      )}
      {comment.orphaned && <p className="gotipe-comment-orphaned">{i18n.t("comments.orphaned")}</p>}
      <p className="gotipe-comment-body">{comment.body}</p>
      <div className="gotipe-comment-actions">
        {comment.anchorBlockId && (
          <button
            type="button"
            disabled={comment.orphaned}
            aria-label={i18n.t("comments.locateLabel")}
            onClick={() => onLocate(comment)}
          >
            {i18n.t("comments.locate")}
          </button>
        )}
        {comment.resolved
          ? onUnresolve && (
              <button
                type="button"
                disabled={busy}
                aria-label={i18n.t("comments.reopenLabel")}
                onClick={() => void run(() => onUnresolve(comment.id))}
              >
                {i18n.t("comments.reopen")}
              </button>
            )
          : onResolve && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => onResolve(comment.id))}
              >
                {i18n.t("comments.resolve")}
              </button>
            )}
        {onDelete && (
          <button
            type="button"
            disabled={busy}
            aria-label={i18n.t("comments.deleteLabel")}
            onClick={() => void run(() => onDelete(comment.id))}
          >
            {i18n.t("comments.delete")}
          </button>
        )}
      </div>
      {!!comment.replies.length && (
        <ol className="gotipe-comment-replies">
          {comment.replies.map((entry) => (
            <li key={entry.id}>
              <div className="gotipe-comment-heading">
                <span className="gotipe-comment-author">{entry.author}</span>
                <Stamp timestamp={entry.timestamp} locale={i18n.locale} />
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
              {currentUser
                ? i18n.t("comments.replyAs", { name: currentUser })
                : i18n.t("comments.replyField")}
              <textarea
                aria-label={i18n.t("comments.replyField")}
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
                placeholder={i18n.t("comments.replyPlaceholder")}
              />
            </label>
            <div className="gotipe-comment-actions">
              <button type="submit" disabled={busy || !reply.trim()}>
                {i18n.t("comments.send")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setReply("");
                  setReplyOpen(false);
                }}
              >
                {i18n.t("comments.cancel")}
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
            {i18n.t("comments.reply")}
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
