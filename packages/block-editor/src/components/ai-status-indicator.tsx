import type { GoTipeEditor } from "@gotipe/core";
import { useEffect, useState } from "react";
import { aiControls } from "./ai-controls";

export interface AiStatusIndicatorProps {
  editor: GoTipeEditor;
}

interface AiStatus {
  active: boolean;
  label?: string;
}

/** The footer line of a running AI request; it needs `defineAi`, which reports the status. */
export function AiStatusIndicator({ editor }: AiStatusIndicatorProps) {
  return aiControls(editor).status ? <Status editor={editor} /> : null;
}

function Status({ editor }: AiStatusIndicatorProps) {
  const [status, setStatus] = useState<AiStatus>({ active: false });

  useEffect(() => {
    const unsub = editor.on("aiStatusChange", (s: AiStatus) => {
      setStatus(s);
    });
    return unsub;
  }, [editor]);

  if (!status.active) return null;

  return (
    <div
      className="gotipe-ai-status-indicator"
      role="status"
      aria-live="polite"
      data-gotipe-ai-status=""
      aria-label={status.label ?? "Using AI toolkit..."}
    >
      <span className="gotipe-ai-status-spinner" aria-hidden="true" />
      <span className="gotipe-ai-status-label">{status.label ?? "Using AI toolkit..."}</span>
    </div>
  );
}
