import { PageEditor } from "@gotipe/block-editor";
import type { GoTipeEditor } from "@gotipe/core";
import { SuggestionsManager } from "@gotipe/suggestions";
import { useCallback, useEffect, useState } from "react";
import "./review-example.css";

const INITIAL =
  "# Review changes\n\nEdit this draft in Suggesting mode. Insert text, remove a phrase or change its formatting, then review the recorded changes.\n\n## Working together\n\nThe document keeps its structure and formatting when you accept or reject a change.\n";
export function SuggestionsExample() {
  const [markdown, setMarkdown] = useState(INITIAL);
  const [editor, setEditor] = useState<GoTipeEditor | null>(null);
  const [manager, setManager] = useState<SuggestionsManager | null>(null);
  const [, render] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const ready = useCallback((value: GoTipeEditor) => setEditor(value), []);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const next = new SuggestionsManager(editor, {
      enabled: true,
      authorId: "you",
      authorName: "You",
    });
    setManager(next);
    const stop = next.subscribe(() => render((value) => value + 1));
    return () => {
      stop();
      next.destroy();
    };
  }, [editor]);
  const records = manager?.getSuggestions() ?? [];
  const pending = records.filter((suggestion) => suggestion.status === "pending");
  const visible = showResolved ? records : pending;
  const tracking = manager?.getState() === "tracking";
  const run = (action: () => void, message = "") => {
    setError("");
    try {
      action();
      setStatus(message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The change could not be reviewed.");
    }
  };
  return (
    <div className="gotipe-review-example" data-gotipe-example="suggestions">
      <div className="gotipe-review-toolbar">
        <fieldset aria-label="Editing mode">
          <button
            type="button"
            data-gotipe-mode="editing"
            aria-pressed={!tracking}
            disabled={!manager}
            onClick={() => run(() => manager?.disable())}
          >
            Editing
          </button>
          <button
            type="button"
            data-gotipe-mode="suggesting"
            aria-pressed={tracking}
            disabled={!manager}
            onClick={() => run(() => manager?.enable())}
          >
            Suggesting
          </button>
        </fieldset>
        <span>
          {pending.length} pending {pending.length === 1 ? "change" : "changes"}
        </span>
        <button
          type="button"
          disabled={!pending.length}
          onClick={() => run(() => manager?.acceptAll(), "All pending changes accepted.")}
        >
          Accept all
        </button>
        <button
          type="button"
          disabled={!pending.length}
          onClick={() => run(() => manager?.rejectAll(), "All pending changes rejected.")}
        >
          Reject all
        </button>
      </div>
      <p className="gotipe-review-description">
        Suggestions are visible in the draft. Accept keeps a change; Reject restores its original
        content. Review records stay in this session.
      </p>
      <p className="gotipe-review-status" role={error ? "alert" : "status"}>
        {error || status}
      </p>
      <div className="gotipe-review-layout">
        <section aria-label="Draft document" className="gotipe-review-document">
          <PageEditor
            markdown={markdown}
            onChange={setMarkdown}
            onReady={ready}
            locale="en"
            onError={(failure) => setError(failure.message)}
          />
        </section>
        <aside className="gotipe-review-sidebar" aria-label="Tracked changes">
          <h2>Changes</h2>
          <label className="gotipe-review-check">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(event) => setShowResolved(event.target.checked)}
            />
            Show reviewed changes
          </label>
          {!visible.length && (
            <p className="gotipe-review-empty">
              {tracking
                ? "Start editing to record a change."
                : "Turn on Suggesting to record new changes."}
            </p>
          )}
          <ol className="gotipe-review-records">
            {visible.map((suggestion) => (
              <li
                key={suggestion.id}
                className="gotipe-review-card"
                data-suggestion-id={suggestion.id}
              >
                <div className="gotipe-review-card-heading">
                  <strong>{suggestion.authorName}</strong>
                  <span>
                    {suggestion.type === "structure"
                      ? "Structure"
                      : suggestion.type === "format"
                        ? "Formatting"
                        : suggestion.type}
                  </span>
                </div>
                {suggestion.originalContent &&
                  suggestion.originalContent !== suggestion.newContent && (
                    <del>{suggestion.originalContent}</del>
                  )}
                {suggestion.newContent && <ins>{suggestion.newContent}</ins>}
                {suggestion.type === "structure" && <p>Block structure or attributes changed.</p>}
                <time dateTime={suggestion.createdAt}>
                  {new Date(suggestion.createdAt).toLocaleTimeString()}
                </time>
                {suggestion.status === "pending" ? (
                  <div className="gotipe-review-actions">
                    <button
                      type="button"
                      onClick={() =>
                        run(() => manager?.acceptSuggestion(suggestion.id), "Change accepted.")
                      }
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          () => manager?.rejectSuggestion(suggestion.id),
                          "Change rejected. Undo can restore it.",
                        )
                      }
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <p className="gotipe-review-state">
                    {suggestion.status === "accepted" ? "Accepted" : "Rejected"}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
