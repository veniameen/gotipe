import { PageEditor, type PageEditorHandle } from "@gotipe/block-editor";
import type { GoTipeEditor, GoTipeError } from "@gotipe/core";
import {
  type LaneCursor,
  type ReviewComment,
  type ReviewProposal,
  applyAnchoredEdits,
} from "@gotipe/suggestions";
import type { ThemePreset } from "@gotipe/theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebugEditor } from "../shared/use-debug-editor";
import {
  PAGE_LANES,
  PAGE_MARKDOWN,
  WRITING_LENGTH,
  demoReview,
  demoWriting,
} from "./page-editor-sample";
import "./page-editor-example.css";

declare global {
  interface Window {
    __GOTIPE_PAGE_EXAMPLE__?: {
      replaceMarkdown(from: string, to: string): void;
      setMarkdown(markdown: string): void;
      /** Shows a review as a host would give it: what is not named is left as it is. */
      setReview(review: {
        proposals?: ReviewProposal[];
        comments?: ReviewComment[];
        cursors?: LaneCursor[];
        /** How the lanes' cursors look (`reviewLaneCursor`). */
        laneCursor?: "caret" | "pointer";
      }): void;
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
  const [laneCursor, setLaneCursor] = useState<"caret" | "pointer">("caret");
  const [writing, setWriting] = useState(false);
  /** The proposals shown were written at one point of the page ("Demo writing"). */
  const [written, setWritten] = useState(false);
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
    const inspection: NonNullable<Window["__GOTIPE_PAGE_EXAMPLE__"]> = {
      replaceMarkdown(from: string, to: string) {
        setMarkdown((current) => (page.current?.getMarkdown() ?? current).replace(from, to));
      },
      setMarkdown,
      setReview(review) {
        if (review.proposals) setProposals(review.proposals);
        if (review.comments) setComments(review.comments);
        if (review.cursors) setCursors(review.cursors);
        if (review.laneCursor) setLaneCursor(review.laneCursor);
      },
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
    setWritten(false);
    setProposals(review.proposals);
    setComments(review.comments);
    setCursors(review.cursors);
  };
  // text written into the page a few letters at a time, as a model's answer arrives
  useEffect(() => {
    if (!writing) return;
    const run = ++generation.current;
    let shown = 0;
    setWritten(true);
    setComments([]);
    const timer = setInterval(() => {
      shown = Math.min(WRITING_LENGTH, shown + 7);
      const review = demoWriting(run, shown);
      setProposals(review.proposals);
      setCursors(review.cursors);
      if (shown >= WRITING_LENGTH) setWriting(false);
    }, 80);
    return () => clearInterval(timer);
  }, [writing]);
  // Proposals written at one point go into the page together, in their order: accepted one by
  // one, the first would move the others' place.
  const acceptWritten = () => {
    const first = proposals[0]?.edits[0];
    if (!first) return;
    const text = [...proposals]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((proposal) => proposal.edits[0]?.text ?? "")
      .join("");
    const result = applyAnchoredEdits(page.current?.getMarkdown() ?? markdown, [
      { ...first, text },
    ]);
    if (!result.ok) return;
    setMarkdown(result.text);
    setDraft(result.text);
    setProposals([]);
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
          aria-pressed={writing}
          onClick={() => setWriting(true)}
          disabled={readOnly || writing}
        >
          Demo writing
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
      <div className="gotipe-page-example-surface" data-writing={writing ? "" : undefined}>
        <PageEditor
          ref={page}
          markdown={markdown}
          onChange={setDraft}
          onReady={ready}
          readOnly={readOnly}
          view={view}
          locale="en"
          onError={reportError}
          reviewLaneCursor={laneCursor}
          review={{
            lanes: PAGE_LANES,
            proposals,
            comments,
            cursors,
            onAcceptAll: written ? acceptWritten : undefined,
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
