import type { GoTipeEditor } from "@gotipe/core";
import type { TranslationKey } from "@gotipe/i18n";
import { useGoTipeI18n } from "@gotipe/react";
import { useEffect, useState } from "react";

export interface AiToolbarProps {
  editor: GoTipeEditor;
  onCommand: (command: string) => void;
}
/** The commands and the words of their buttons. */
const ACTIONS: [command: string, label: TranslationKey][] = [
  ["rewrite", "ai.rewrite"],
  ["summarize", "ai.summarize"],
  ["expand", "ai.expand"],
  ["fixGrammar", "ai.fixGrammar"],
  ["translate", "ai.translate"],
];

/** Its words come from `GoTipeI18nProvider` (`@gotipe/react`), English without one. */
export function AiToolbar({ editor, onCommand }: AiToolbarProps) {
  const i18n = useGoTipeI18n();
  const [editable, setEditable] = useState(editor.isEditable);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setEditable(editor.isEditable);
    const offEditable = editor.on("editableChange", setEditable);
    const offStatus = editor.on("aiStatusChange", ({ active }) => setBusy(active));
    const offDestroy = editor.on("destroy", () => setEditable(false));
    return () => {
      offEditable();
      offStatus();
      offDestroy();
    };
  }, [editor]);
  return (
    <div className="gotipe-ai-toolbar" role="toolbar" aria-label={i18n.t("ai.actions")}>
      {ACTIONS.map(([command, label]) => (
        <button
          type="button"
          key={command}
          disabled={!editable || busy}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (editor.isEditable && !editor.isDestroyed && !busy) onCommand(command);
          }}
        >
          {i18n.t(label)}
        </button>
      ))}
    </div>
  );
}
