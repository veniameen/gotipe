import { CommentSidebar, PageEditor } from "@gotipe/block-editor";
import { CommentsManager } from "@gotipe/comments";
import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  STORAGE_KEY,
  readSession,
  saveSession,
  selectedRange,
  sidebarComment,
} from "./comments/session";
import "./review-example.css";
import "./comments/example.css";

export function CommentsExample() {
  const [initial] = useState(readSession);
  const [markdown, setMarkdown] = useState(initial.markdown);
  const [editor, setEditor] = useState<GoTipeEditor | null>(null);
  const [manager, setManager] = useState<CommentsManager | null>(null);
  const [, render] = useState(0);
  const [error, setError] = useState(initial.error ?? "");
  const [saved, setSaved] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [draft, setDraft] = useState<ReturnType<typeof selectedRange> | null>(null);
  const [body, setBody] = useState("");
  const composer = useRef<HTMLTextAreaElement>(null);
  const ready = useCallback((value: GoTipeEditor) => setEditor(value), []);
  useEffect(() => {
    if (draft) composer.current?.focus();
  }, [draft]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const next = new CommentsManager(editor);
    let writable = !initial.error;
    try {
      if (initial.comments !== undefined) next.loadState(initial.comments);
    } catch (failure) {
      writable = false;
      setError(
        failure instanceof Error ? failure.message : "Saved comments could not be restored.",
      );
    }
    const persist = () => {
      if (!writable) return;
      try {
        saveSession(editor, next);
        setSaved(true);
      } catch (failure) {
        setSaved(false);
        setError(failure instanceof Error ? failure.message : "The discussion could not be saved.");
      }
    };
    const stopComments = next.subscribe(() => {
      render((value) => value + 1);
      persist();
    });
    const stopDocument = editor.on("update", persist);
    setManager(next);
    return () => {
      stopComments();
      stopDocument();
      next.destroy();
    };
  }, [editor, initial]);
  const start = () => {
    if (!editor) return;
    try {
      setDraft(selectedRange(editor));
      setBody("");
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Select text first.");
    }
  };
  const submit = () => {
    if (!manager || !editor || !draft || !body.trim()) return;
    try {
      if (draft.document !== JSON.stringify(editor.getJSON()))
        throw new Error("The draft changed. Select the quote again before posting.");
      manager.addComment({ ...draft.range, authorId: "you", authorName: "You", content: body });
      setDraft(null);
      setBody("");
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The comment could not be added.");
    }
  };
  const reset = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The saved discussion could not be reset.",
      );
    }
  };
  return (
    <div className="gotipe-review-example" data-gotipe-example="comments">
      <div className="gotipe-review-toolbar">
        <button
          type="button"
          disabled={!manager}
          onMouseDown={(event) => event.preventDefault()}
          onClick={start}
        >
          Add comment
        </button>
        <label className="gotipe-review-check">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(event) => setReadOnly(event.target.checked)}
          />
          Read-only document
        </label>
        <span>{saved ? "Saved in this browser tab" : "Discussion stays in this browser tab"}</span>
        <button type="button" onClick={reset}>
          Reset demo
        </button>
      </div>
      <p className="gotipe-review-description">
        Select text, then add a comment. Comments and replies stay available in read-only mode.
        Reloading this tab restores the draft and discussion.
      </p>
      <p className="gotipe-review-status" role={error ? "alert" : "status"}>
        {error}
      </p>
      {draft && (
        <form
          className="gotipe-comment-composer"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <blockquote>{draft.quote}</blockquote>
          <label>
            Comment
            <textarea
              ref={composer}
              aria-label="New comment"
              value={body}
              rows={3}
              maxLength={10000}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (
                  (event.metaKey || event.ctrlKey) &&
                  event.key === "Enter" &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  submit();
                }
                if (event.key === "Escape") setDraft(null);
              }}
            />
          </label>
          <div className="gotipe-review-actions">
            <button type="submit" disabled={!body.trim()}>
              Post comment
            </button>
            <button type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="gotipe-review-layout">
        <section className="gotipe-review-document" aria-label="Discussion document">
          <PageEditor
            markdown={markdown}
            onChange={setMarkdown}
            onReady={ready}
            readOnly={readOnly}
            locale="en"
            onError={(failure) => setError(failure.message)}
          />
        </section>
        {editor && manager && (
          <CommentSidebar
            editor={editor}
            comments={manager.getComments().map(sidebarComment)}
            currentUser="You"
            onAddReply={(id, content) => {
              manager.addReply(id, { authorId: "you", authorName: "You", content });
            }}
            onResolve={(id) => manager.resolveComment(id, "you")}
            onUnresolve={(id) => manager.unresolveComment(id)}
            onDelete={(id) => manager.deleteComment(id)}
          />
        )}
      </div>
    </div>
  );
}
