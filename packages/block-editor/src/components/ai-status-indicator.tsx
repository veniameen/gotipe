import type { EditorEvents, GoTipeEditor } from "@gotipe/core";
import type { TranslationKey } from "@gotipe/i18n";
import { useEffect, useState } from "react";
import { useBlockEditorI18n } from "../i18n/strings";
import { aiControls } from "./ai-controls";

export interface AiStatusIndicatorProps {
  editor: GoTipeEditor;
}

/** `aiStatusChange` as the core declares it: `task` says what runs (D-196). */
type AiStatus = Parameters<EditorEvents["aiStatusChange"]>[0];

/** The words of each task of `@gotipe/ai`. */
const TASKS: Record<NonNullable<AiStatus["task"]>, TranslationKey> = {
  suggestions: "ai.status.suggestions",
  completion: "ai.status.completion",
  rewrite: "ai.status.rewrite",
  continue: "ai.status.continue",
  paragraph: "ai.status.paragraph",
  proofread: "ai.status.proofread",
  review: "ai.status.review",
  command: "ai.processing",
};

/**
 * The footer line of a running AI request; it needs `defineAi`, which reports the status. It
 * says the task in the interface's language; a status of the host's own, without a task this
 * line knows, shows its `label` as it is.
 */
export function AiStatusIndicator({ editor }: AiStatusIndicatorProps) {
  return aiControls(editor).status ? <Status editor={editor} /> : null;
}

function Status({ editor }: AiStatusIndicatorProps) {
  const i18n = useBlockEditorI18n();
  const [status, setStatus] = useState<AiStatus>({ active: false });

  useEffect(() => {
    const unsub = editor.on("aiStatusChange", (s) => {
      setStatus(s);
    });
    return unsub;
  }, [editor]);

  if (!status.active) return null;
  // A JavaScript host or a newer `@gotipe/ai` may send a code this line does not know.
  const key = status.task && Object.hasOwn(TASKS, status.task) ? TASKS[status.task] : undefined;
  const text = key ? i18n.t(key) : (status.label ?? i18n.t("ai.processing"));

  return (
    <div
      className="gotipe-ai-status-indicator"
      role="status"
      aria-live="polite"
      data-gotipe-ai-status=""
      aria-label={text}
    >
      <span className="gotipe-ai-status-spinner" aria-hidden="true" />
      <span className="gotipe-ai-status-label">{text}</span>
    </div>
  );
}
