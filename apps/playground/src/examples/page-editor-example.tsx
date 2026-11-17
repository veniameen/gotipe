import { PageEditor, type PageEditorHandle } from "@gotipe/block-editor";
import type { GoTipeEditor, GoTipeError } from "@gotipe/core";
import type { LaneCursor, ReviewComment, ReviewProposal } from "@gotipe/suggestions";
import type { ThemePreset } from "@gotipe/theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebugEditor } from "../shared/use-debug-editor";
import { PAGE_LANES, PAGE_MARKDOWN, demoReview } from "./page-editor-sample";
import "./page-editor-example.css";

declare global {
  interface Window {
    __GOTIPE_PAGE_EXAMPLE__?: {
      replaceMarkdown(from: string, to: string): void;
      setMarkdown(markdown: string): void;
    };
  }
}

/** A public library component with small, explicit playground controls. */
export function PageEditorExample() {
  const [markdown, setMarkdown] = useState(PAGE_MARKDOWN);
  const [draft, setDraft] = useState(PAGE_MARKDOWN);
  const [readOnly, setReadOnly] = useState(false);
  const [view, setView] = useState<ThemePreset>("notion");
  const [showSource, setShowSource] = useState(false);
  const [editor, setEditor] = useState<GoTipeEditor | null>(null);
  const [error, setError] = useState<{ message: string; recoveryText?: string } | null>(null);
  const [proposals, setProposals] = useState<ReviewProposal[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [cursors, setCursors] = useState<LaneCursor[]>([]);
  const page = useRef<PageEditorHandle>(null);
  const generation = useRef(0);
  const ready = useCallback((next: GoTipeEditor) => setEditor(next), []);
  const reportError = useCallback((cause: GoTipeError) => {
    setError({
      message: cause.message,
      recoveryText:
        cause.code === "COMPOSITION_CONFLICT" && typeof cause.details?.text === "string"
          ? cause.details.text
          : undefined,
    });
  }, []);
  useDebugEditor("__GOTIPE_EDITOR__", editor);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const inspection = {
      replaceMarkdown(from: string, to: string) {
        setMarkdown((current) => (page.current?.getMarkdown() ?? current).replace(from, to));
      },
      setMarkdown,
    };
    window.__GOTIPE_PAGE_EXAMPLE__ = inspection;
    return () => {
      if (window.__GOTIPE_PAGE_EXAMPLE__ === inspection) {
        Reflect.deleteProperty(window, "__GOTIPE_PAGE_EXAMPLE__");
      }
    };
  }, []);
  const loadReview = () => {
    const review = demoReview(++generation.current);
    setProposals(review.proposals);
    setComments(review.comments);
    setCursors(review.cursors);
  };
  return (
    <section className="gotipe-page-example" data-gotipe-example="page" aria-label="Editor example">
      <div className="gotipe-page-example-controls">
        <h2>Editor</h2>
        <label className="gotipe-editor-view">
          View
          <select
            value={view}
            onChange={(event) => setView(event.target.value as ThemePreset)}
            aria-label="Page view"
          >
            {(["notion", "docs", "modern", "minimal"] as const).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="gotipe-button" onClick={loadReview} disabled={readOnly}>
          Demo suggestions
        </button>
        <button
          type="button"
          className="gotipe-button"
          aria-pressed={readOnly}
          data-gotipe-page-readonly=""
          onClick={() => setReadOnly((value) => !value)}
        >
          Read only
        </button>
        <button
          type="button"
          className="gotipe-button"
          aria-pressed={showSource}
          onClick={() => setShowSource((value) => !value)}
        >
          Markdown
        </button>
      </div>
      {error && (
        <div className="gotipe-page-example-error" role="alert">
          <p>{error.message}</p>
          {error.recoveryText !== undefined && (
            <textarea aria-label="Recovery text" readOnly value={error.recoveryText} />
          )}
          <button type="button" onClick={() => setError(null)}>
            Dismiss error
          </button>
        </div>
      )}
      <div className="gotipe-page-example-surface">
        <PageEditor
          ref={page}
          markdown={markdown}
          onChange={setDraft}
          onReady={ready}
          readOnly={readOnly}
          view={view}
          locale="en"
          onError={reportError}
          review={{
            lanes: PAGE_LANES,
            proposals,
            comments,
            cursors,
            onReject: (id) => {
              setProposals((current) => current.filter((proposal) => proposal.id !== id));
              return true;
            },
            onReply: (id, text) => {
              setComments((current) =>
                current.map((comment) =>
                  comment.id === id
                    ? {
                        ...comment,
                        replies: [
                          ...(comment.replies ?? []),
                          { id: crypto.randomUUID(), author: "You", text },
                        ],
                      }
                    : comment,
                ),
              );
              return true;
            },
          }}
          reviewBar={proposals.length ? { title: "Demo suggestions" } : false}
        />
      </div>
      {showSource && (
        <pre
          className="gotipe-page-example-source"
          data-gotipe-page-source=""
          aria-label="Markdown source"
        >
          {draft}
        </pre>
      )}
    </section>
  );
}
