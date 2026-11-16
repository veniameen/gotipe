import { type Document, type GoTipeEditor, GoTipeError } from "@gotipe/core";
import type React from "react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keyLabel } from "../components/formatting/keys";
import { intlLocale } from "../i18n/intl-locale";
import { useBlockEditorI18n as useGoTipeI18n } from "../i18n/strings";
import { PageIcon } from "../page/icons";
import { CompareView } from "./compare-view";
import { HistoryList } from "./history-list";
import {
  EMPTY,
  type HistoryRow,
  type HistoryVersion,
  LIVE_ROW,
  compareTree,
  savedRows,
  timeLabel,
  withLiveRow,
} from "./history-model";

/** Saved versions the panel reads; `VersionsManager` of `@gotipe/versions` is one. */
export interface VersionHistorySource {
  getVersions(): readonly HistoryVersion[];
  subscribe(listener: () => void): () => void;
  /** Saves the page as it is: the panel keeps the state before a restore and the restore itself. */
  createVersion?(name: string, createdBy: string): unknown;
  /** Puts the version on the page as one undo step; without it the panel does that itself. */
  restoreVersion?(id: string): boolean;
}

/** What a host that owns the versions saves after a restore, with the panel's names for it. */
export interface RestoreContext {
  /** The page before the restore when no saved version held it, to keep as `names.unsaved`. */
  unsaved: Document | null;
  /** «До восстановления» and «Возврат к «…»» in the panel's language. */
  names: { unsaved: string; restored: string };
}

export interface VersionHistoryProps {
  /**
   * The live page's editor: its document is compared and restored, one undo step. While it is
   * `null` (a page that creates its editor on mount) only the page is shown.
   */
  editor: GoTipeEditor | null;
  /** Saved versions read from a source (a `VersionsManager`); or pass `versions`. */
  source?: VersionHistorySource;
  /** Saved versions the host owns, in any order. */
  versions?: readonly HistoryVersion[];
  /** Who works on the page: the row of the unsaved page and the entries of a restore are theirs. */
  user?: { name: string; person?: 1 | 2 | 3 };
  /**
   * After the version is on the page. `unsaved` is the page as it was, when no saved version held
   * it: a host that owns the versions saves it and the restore. A rejection undoes the restore.
   */
  onRestore?: (version: HistoryVersion, context: RestoreContext) => void | Promise<void>;
  /** The close button and Escape; focus goes back to where it was before the panel opened. */
  onClose?: () => void;
  /** Without the panel only the page stays, mounted as it was; default `true`. */
  open?: boolean;
  loading?: boolean;
  /** An error of loading the versions; the panel offers `onRetry`. */
  error?: string | null;
  onRetry?: () => void;
  /** The live page; it stays mounted while a version is compared. */
  children: ReactNode;
  className?: string;
}

/** How long typing pauses before the panel reads the page again, in milliseconds. */
const LIVE_DELAY = 400;

/**
 * Version history (GoTipe Atlas, frame 30): versions by day beside the page; a chosen version is
 * compared with the current page block by block, «Восстановить» puts it back as one undo step and
 * a toast takes it back. On a narrow container the list and the comparison are two screens.
 */
export function VersionHistory({
  editor,
  source,
  versions,
  user,
  onRestore,
  onClose,
  open: wanted = true,
  loading,
  error,
  onRetry,
  children,
  className,
}: VersionHistoryProps) {
  const i18n = useGoTipeI18n();
  const open = wanted && !!editor && !editor.isDestroyed;
  const [fromSource, setFromSource] = useState<readonly HistoryVersion[]>(
    () => source?.getVersions() ?? [],
  );
  useEffect(() => {
    if (!source) return;
    setFromSource(source.getVersions());
    return source.subscribe(() => setFromSource(source.getVersions()));
  }, [source]);
  const list = versions ?? fromSource;

  // the live page: its document and the time of its last change. Read only while the panel is
  // open, and once typing pauses, so a keystroke never pays for a comparison of the whole page
  const [live, setLive] = useState(() => ({ doc: EMPTY, at: new Date() }));
  useEffect(() => {
    if (!editor || !open) return;
    const read = () => {
      if (!editor.isDestroyed) setLive({ doc: editor.getJSON(), at: new Date() });
    };
    read();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = editor.on("update", () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        read();
      }, LIVE_DELAY);
    });
    return () => {
      off();
      if (timer !== null) clearTimeout(timer);
    };
  }, [editor, open]);

  const saved = useMemo(() => savedRows(list), [list]);
  const rows = useMemo(
    () => (open ? withLiveRow(saved, live.doc, live.at, user) : saved),
    [open, saved, live, user],
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const liveRow = rows.find((row) => row.live);
  const selectedRow = rows.find((row) => row.id === chosen) ?? liveRow;
  const comparing = !!selectedRow && !selectedRow.live && !!selectedRow.version;
  const [screen, setScreen] = useState<"list" | "page">("list");
  const [toast, setToast] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);

  // focus goes back to the control that opened the panel; a closed panel forgets its choice
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    return () => {
      setChosen(null);
      setScreen("list");
      setToast(null);
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  const versionName = useCallback(
    (version: HistoryVersion) =>
      version.auto || version.createdBy === "system" ? i18n.t("history.autoSave") : version.name,
    [i18n],
  );
  const nameOf = useCallback(
    (row: HistoryRow) => (row.version ? versionName(row.version) : i18n.t("history.current")),
    [i18n, versionName],
  );
  const compared = useMemo(
    () =>
      comparing && selectedRow?.version
        ? compareTree(selectedRow.version.snapshot, live.doc)
        : null,
    [comparing, selectedRow, live.doc],
  );

  const select = (id: string) => {
    setChosen(id);
    setScreen("page");
    setFailure(null);
  };
  const back = () => {
    setScreen("list");
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(),
    );
  };

  const restore = async (version: HistoryVersion) => {
    if (busy || !editor || editor.isDestroyed || !editor.isEditable) return;
    const author = user?.name ?? "";
    const before = editor.getJSON();
    // the page as it is now, not as the panel last read it while typing paused
    const current = withLiveRow(saved, before, new Date(), user)[0];
    const unsaved = current && !current.version ? before : null;
    const name = versionName(version);
    setBusy(true);
    setFailure(null);
    try {
      if (unsaved && source?.createVersion)
        source.createVersion(i18n.t("history.beforeRestore"), author);
      const restored = source?.restoreVersion ? source.restoreVersion(version.id) : null;
      if (restored === false)
        throw new GoTipeError("VALIDATION_ERROR", "The version no longer exists");
      if (restored === null)
        editor.setContent(structuredClone(version.snapshot), {
          addToHistory: true,
          preserveSelection: true,
        });
      try {
        await onRestore?.(version, {
          unsaved,
          names: {
            unsaved: i18n.t("history.beforeRestore"),
            restored: i18n.t("history.restoredName", { name }),
          },
        });
      } catch (cause) {
        if (!editor.isDestroyed) editor.undo();
        throw cause;
      }
      source?.createVersion?.(i18n.t("history.restoredName", { name }), author);
      if (!editor.isDestroyed) setLive({ doc: editor.getJSON(), at: new Date() });
      setChosen(null);
      setToast(name);
    } catch (cause) {
      const message = cause instanceof Error && cause.message ? cause.message : "";
      setFailure(i18n.t("history.restoreFailed"));
      editor.reportError(
        cause instanceof GoTipeError
          ? cause
          : new GoTipeError("TRANSFORM_ERROR", message || "Version restore failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const keys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !onClose) return;
    // the page handles its own keys; Escape closes the history from the panel and the head
    const target = event.target as HTMLElement;
    if (target.closest(".gotipe-history-page")) return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  const version = comparing ? selectedRow?.version : null;
  const facts = version ? (
    <span className="gotipe-history-facts">
      <span className="gotipe-review-fact">
        {new Intl.DateTimeFormat(intlLocale(i18n.locale), { day: "numeric", month: "long" }).format(
          new Date(version.createdAt),
        )}
        , {timeLabel(new Date(version.createdAt), i18n.locale)}
      </span>
      {compared ? (
        <span
          className="gotipe-diff-stat"
          role="img"
          aria-label={i18n.t("history.blocks", {
            added: compared.added,
            removed: compared.removed,
            changed: compared.changed,
          })}
        >
          <span className="is-add">+{compared.added}</span> ·{" "}
          <span className="is-del">−{compared.removed}</span> ·{" "}
          <span className="is-change">{i18n.plural("history.changed", compared.changed)}</span>
        </span>
      ) : null}
    </span>
  ) : (
    <span className="gotipe-history-facts">
      <span className="gotipe-review-fact">{i18n.t("history.now")}</span>
    </span>
  );

  return (
    <div
      ref={shellRef}
      className={`gotipe-history-shell${className ? ` ${className}` : ""}`}
      onKeyDown={keys}
    >
      <div className="gotipe-history" data-screen={screen} data-open={open}>
        <div className="gotipe-history-main">
          {open && toast ? (
            <div className="gotipe-toast is-done" role="status">
              <PageIcon name="restore" />
              {i18n.t("history.restored", { name: toast })}
              <button
                type="button"
                className="gotipe-btn"
                onClick={() => {
                  if (editor && !editor.isDestroyed) editor.undo();
                  setToast(null);
                }}
              >
                {i18n.t("history.undo")}
                <span className="gotipe-key">{keyLabel("mod-z")}</span>
              </button>
            </div>
          ) : null}
          {open ? (
            <div className="gotipe-version-head gotipe-history-head">
              <button
                type="button"
                className="gotipe-review-icon-btn gotipe-history-back"
                aria-label={i18n.t("history.back")}
                title={i18n.t("history.back")}
                onClick={back}
              >
                <PageIcon name="chevronLeft" />
              </button>
              <span className="gotipe-review-title">
                {version ? versionName(version) : i18n.t("history.current")}
              </span>
              {facts}
              <span className="gotipe-tool-spacer" />
              {version ? (
                <button
                  type="button"
                  className="gotipe-btn gotipe-btn-primary"
                  disabled={
                    busy ||
                    !editor?.isEditable ||
                    (!!compared && compared.added + compared.removed + compared.changed === 0)
                  }
                  data-gotipe-action="restore-version"
                  onClick={() => void restore(version)}
                >
                  <PageIcon name="restore" />
                  {i18n.t("history.restore")}
                </button>
              ) : null}
            </div>
          ) : null}
          {open && failure && version ? (
            <p className="gotipe-history-note is-error" role="alert">
              {failure}
            </p>
          ) : null}
          {open && compared ? (
            <CompareView
              nodes={compared.nodes}
              empty={
                compared.added + compared.removed + compared.changed === 0
                  ? i18n.t("history.same")
                  : null
              }
            />
          ) : null}
          <div className="gotipe-history-page" hidden={open && !!compared}>
            {children}
          </div>
        </div>
        {open ? (
          <HistoryList
            i18n={i18n}
            rows={loading || error ? [] : rows}
            selected={selectedRow?.id ?? LIVE_ROW}
            now={new Date()}
            loading={loading}
            error={error}
            onRetry={onRetry}
            onSelect={select}
            onClose={onClose}
            nameOf={nameOf}
            listRef={listRef}
          />
        ) : null}
      </div>
    </div>
  );
}
