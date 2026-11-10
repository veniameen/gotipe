import type { GoTipeEditor } from "@gotipe/core";
import { useEffect, useState } from "react";

export interface AiToolbarProps {
  editor: GoTipeEditor;
  onCommand: (command: string) => void;
}
export function AiToolbar({ editor, onCommand }: AiToolbarProps) {
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
    <div className="gotipe-ai-toolbar" role="toolbar" aria-label="AI actions">
      {[
        ["rewrite", "Rewrite"],
        ["summarize", "Summarize"],
        ["expand", "Expand"],
        ["fixGrammar", "Fix grammar"],
        ["translate", "Translate"],
      ].map(([command, label]) => (
        <button
          type="button"
          key={command}
          disabled={!editable || busy}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (editor.isEditable && !editor.isDestroyed && !busy) onCommand(command!);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
