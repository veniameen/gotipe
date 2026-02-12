import type { GoTipeEditor } from "@gotipe/core";

export interface AiToolbarProps {
  editor: GoTipeEditor;
  onCommand: (command: string) => void;
}

export function AiToolbar({ editor: _editor, onCommand }: AiToolbarProps) {
  return (
    <div className="gotipe-ai-toolbar" role="toolbar" aria-label="AI actions">
      <button type="button" onClick={() => onCommand("rewrite")}>
        Rewrite
      </button>
      <button type="button" onClick={() => onCommand("summarize")}>
        Summarize
      </button>
      <button type="button" onClick={() => onCommand("expand")}>
        Expand
      </button>
      <button type="button" onClick={() => onCommand("fixGrammar")}>
        Fix grammar
      </button>
      <button type="button" onClick={() => onCommand("translate")}>
        Translate
      </button>
    </div>
  );
}
