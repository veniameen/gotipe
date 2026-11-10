import { PageEditor } from "@gotipe/block-editor";
import type { GoTipeEditor } from "@gotipe/core";
import { serializeMarkdown } from "@gotipe/markdown";
import { VersionsManager } from "@gotipe/versions";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { VersionChanges } from "./versions/version-diff";
import "./versions/versions.css";

const INITIAL =
  "# Document history\n\nEdit this page, then save a named version. Open history to preview an earlier draft, compare changes and restore it.\n\n## Release checklist\n\n- [x] Write the first draft\n- [ ] Review the changes\n- [ ] Save the approved version\n";

export function VersionsExample() {
  const id = useId();
  const [markdown, setMarkdown] = useState(INITIAL);
  const [editor, setEditor] = useState<GoTipeEditor | null>(null);
  const [manager, setManager] = useState<VersionsManager | null>(null);
  const [, setRevision] = useState(0);
  const [name, setName] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"preview" | "changes">("changes");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const ready = useCallback((value: GoTipeEditor) => setEditor(value), []);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const next = new VersionsManager(editor, {
      autoSave: true,
      autoSaveInterval: 30000,
      maxVersions: 100,
    });
    const first = next.createVersion("Initial draft", "You");
    setSelectedId(first.id);
    setManager(next);
    const off = next.subscribe(() => setRevision((value) => value + 1));
    const offUpdate = editor.on("update", () => setRevision((value) => value + 1));
    return () => {
      off();
      offUpdate();
      next.destroy();
    };
  }, [editor]);
  const versions = manager?.getVersions().reverse() ?? [];
  const selected = versions.find((version) => version.id === selectedId) ?? versions[0];
  const preview = useMemo(
    () => (selected ? serializeMarkdown(selected.snapshot).text : ""),
    [selected],
  );
  const current = editor && !editor.isDestroyed ? editor.getJSON() : null;
  const run = (action: () => void) => {
    setError("");
    try {
      action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The version could not be updated.");
    }
  };

  return (
    <div data-gotipe-example="versions" className="gotipe-versions-example">
      <div className="gotipe-versions-toolbar">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(() => {
              if (!manager) return;
              const version = manager.createVersion(
                name.trim() || `Version ${versions.length + 1}`,
                "You",
              );
              setName("");
              setSelectedId(version.id);
              setStatus(`Saved “${version.name}”.`);
            });
          }}
        >
          <label htmlFor={`${id}-name`}>
            Version name
            <input
              id={`${id}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ready for review"
              maxLength={120}
              disabled={!manager}
            />
          </label>
          <button
            type="submit"
            className="gotipe-version-button"
            data-gotipe-action="create-version"
            disabled={!manager}
          >
            Save version
          </button>
        </form>
        <button
          type="button"
          className="gotipe-version-button"
          data-gotipe-action="show-history"
          aria-expanded={showHistory}
          aria-controls={`${id}-history`}
          onClick={() => setShowHistory((value) => !value)}
          disabled={!manager}
        >
          {showHistory ? "Hide history" : "Show history"} ({versions.length})
        </button>
      </div>
      <p className="gotipe-versions-meta">
        Changes are saved every 30 seconds. This example keeps up to 100 versions during the current
        session.
      </p>
      <p
        className={`gotipe-versions-status${error ? " gotipe-versions-error" : ""}`}
        role={error ? "alert" : "status"}
      >
        {error || status}
      </p>
      <div className="gotipe-versions-layout" data-history={showHistory}>
        <section className="gotipe-version-document" aria-label="Current document">
          <PageEditor
            markdown={markdown}
            onChange={setMarkdown}
            onReady={ready}
            locale="en"
            onError={(failure) => setError(failure.message)}
          />
        </section>
        {showHistory && (
          <aside
            id={`${id}-history`}
            className="gotipe-version-history"
            aria-label="Version history"
          >
            <h2>Version history</h2>
            {!versions.length ? (
              <p className="gotipe-version-empty">Save a version to start the history.</p>
            ) : (
              <ul>
                {versions.map((version) => (
                  <li key={version.id}>
                    <button
                      type="button"
                      className="gotipe-version-entry"
                      aria-pressed={selected?.id === version.id}
                      onClick={() => setSelectedId(version.id)}
                    >
                      <strong>{version.name}</strong>
                      <time dateTime={version.createdAt}>
                        {new Date(version.createdAt).toLocaleString()}
                      </time>
                      <span>
                        {version.createdBy === "system" ? "Automatic save" : version.createdBy}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
      {showHistory && selected && (
        <section className="gotipe-version-preview" aria-label="Saved version">
          <div className="gotipe-version-preview-header">
            <h2>{selected.name}</h2>
            <button
              type="button"
              className="gotipe-version-button"
              data-gotipe-action="restore-version"
              onClick={() =>
                run(() => {
                  if (manager?.restoreVersion(selected.id))
                    setStatus(
                      `Restored “${selected.name}”. Use Undo in the document to reverse this change.`,
                    );
                })
              }
            >
              Restore this version
            </button>
          </div>
          <div
            className="gotipe-version-tabs"
            role="tablist"
            aria-label="Version view"
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "changes"
                  : event.key === "End"
                    ? "preview"
                    : tab === "changes"
                      ? "preview"
                      : "changes";
              setTab(next);
              event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
            }}
          >
            <button
              type="button"
              role="tab"
              data-tab="changes"
              id={`${id}-changes-tab`}
              aria-controls={`${id}-view`}
              aria-selected={tab === "changes"}
              tabIndex={tab === "changes" ? 0 : -1}
              className="gotipe-version-button"
              onClick={() => setTab("changes")}
            >
              Changes from this version
            </button>
            <button
              type="button"
              role="tab"
              data-tab="preview"
              id={`${id}-preview-tab`}
              aria-controls={`${id}-view`}
              aria-selected={tab === "preview"}
              tabIndex={tab === "preview" ? 0 : -1}
              className="gotipe-version-button"
              onClick={() => setTab("preview")}
            >
              Preview
            </button>
          </div>
          <div
            id={`${id}-view`}
            role="tabpanel"
            aria-labelledby={`${id}-${tab}-tab`}
            className="gotipe-version-preview-body"
          >
            {tab === "preview" ? (
              <PageEditor markdown={preview} readOnly locale="en" />
            ) : (
              current && <VersionChanges before={selected.snapshot} after={current} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
