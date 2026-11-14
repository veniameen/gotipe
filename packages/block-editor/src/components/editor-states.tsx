import type { GoTipeEditor, GoTipeError, GoTipeErrorCode } from "@gotipe/core";
import type { TranslationKey } from "@gotipe/i18n";
import { useEditorState } from "@gotipe/react";
import { useEffect, useState } from "react";
import { useBlockEditorI18n } from "../i18n/strings";
import { PageIcon, type PageIconName } from "../page/icons";

/** The shape of a page while the editor loads (GoTipe Atlas, frame 17): no shimmer. */
export function EditorSkeleton({ label }: { label?: string }) {
  const i18n = useBlockEditorI18n();
  return (
    <div className="gotipe-skeleton" role="status" aria-busy="true" data-gotipe-skeleton="">
      <span className="gotipe-sr-only">{label ?? i18n.t("state.loading")}</span>
      <span className="is-title" aria-hidden="true" />
      <span className="is-meta" aria-hidden="true" />
      <span className="is-90" aria-hidden="true" />
      <span className="is-75" aria-hidden="true" />
      <span className="is-block" aria-hidden="true" />
      <span className="is-90" aria-hidden="true" />
      <span className="is-60" aria-hidden="true" />
    </div>
  );
}

/** Errors a person can act on; the editor's internal conflicts stay in the error event. */
const TOAST_TITLES: Partial<Record<GoTipeErrorCode, TranslationKey>> = {
  TRANSFORM_ERROR: "error.transform",
  CLIPBOARD_FAILED: "error.clipboard",
  ASSET_SAVE_FAILED: "error.assetSave",
  ASSET_RESOLVE_FAILED: "error.assetResolve",
  ASSET_UNSUPPORTED: "error.assetUnsupported",
  ASSET_TOO_LARGE: "error.assetTooLarge",
  LINK_BLOCKED: "error.linkBlocked",
  LINK_OPEN_FAILED: "error.linkOpen",
  COLLABORATION_ERROR: "error.collaboration",
  PROPOSAL_ACTION_FAILED: "error.proposal",
  COMMENT_ACTION_FAILED: "error.comment",
};

/**
 * A toast at the top of the window for an error the editor reports (GoTipe Atlas, frame 17). It is
 * the visible copy of the message; the control that failed keeps its own alert for screen readers.
 */
export function EditorErrorToast({
  editor,
  duration = 4000,
}: { editor: GoTipeEditor; duration?: number }) {
  const [shown, setShown] = useState<{ error: GoTipeError; id: number } | null>(null);
  const i18n = useBlockEditorI18n();
  useEffect(() => {
    let id = 0;
    return editor.on("error", (error) => {
      if (TOAST_TITLES[error.code]) setShown({ error, id: ++id });
      // Listening stops the core's own logging; an error without a toast still reaches the console.
      else console.error(error);
    });
  }, [editor]);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), duration);
    return () => clearTimeout(timer);
  }, [shown, duration]);
  const title = shown ? TOAST_TITLES[shown.error.code] : undefined;
  if (!shown || !title) return null;
  return (
    <div className="gotipe-toast" aria-hidden="true" data-gotipe-toast="">
      <PageIcon name="warning" />
      <span className="gotipe-toast-title">{i18n.t(title)}</span>
      {shown.error.message ? (
        <span className="gotipe-toast-detail">{shown.error.message}</span>
      ) : null}
    </div>
  );
}

/** Quick blocks under an empty page (GoTipe Atlas, frame 11), run as their slash commands. */
const STARTERS: { command: string; icon: PageIconName; label: TranslationKey }[] = [
  { command: "check-square", icon: "todo", label: "slash.todoList" },
  { command: "table", icon: "table", label: "slash.table" },
  { command: "code", icon: "code", label: "slash.code" },
  { command: "image", icon: "image", label: "slash.image" },
];

export function EditorStarters({ editor }: { editor: GoTipeEditor }) {
  const blocks = useEditorState(editor, (state) => state.blocks) ?? editor.getViewState().blocks;
  const i18n = useBlockEditorI18n();
  const only = blocks.length === 1 ? blocks[0] : undefined;
  const empty =
    only?.type === "paragraph" &&
    only.children.length === 0 &&
    (only.content === null ||
      (Array.isArray(only.content) && only.content.every((span) => span.text.length === 0)));
  if (!only || !empty || !editor.isEditable) return null;
  const commands = editor.getSlashCommands();
  const available = STARTERS.filter((starter) =>
    commands.some((command) => command.icon === starter.command),
  );
  if (available.length === 0) return null;
  const run = (icon: string) => {
    const command = commands.find((item) => item.icon === icon);
    if (!command) return;
    editor.focus();
    editor.setSelection({
      anchor: { blockId: only.id, offset: 0 },
      head: { blockId: only.id, offset: 0 },
    });
    command.execute(editor);
  };
  return (
    <div
      className="gotipe-starters"
      role="group"
      aria-label={i18n.t("state.startWith")}
      data-gotipe-starters=""
    >
      {available.map((starter) => (
        <button
          key={starter.command}
          type="button"
          className="gotipe-starter"
          onClick={() => run(starter.command)}
        >
          <PageIcon name={starter.icon} />
          {i18n.t(starter.label)}
        </button>
      ))}
    </div>
  );
}
