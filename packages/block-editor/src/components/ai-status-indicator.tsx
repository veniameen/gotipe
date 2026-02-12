import type { GoTipeEditor } from "@gotipe/core";
import { useEffect, useState } from "react";

export interface AiStatusIndicatorProps {
  editor: GoTipeEditor;
}

interface AiStatus {
  active: boolean;
  label?: string;
}

export function AiStatusIndicator({ editor }: AiStatusIndicatorProps) {
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
      <span className="gotipe-ai-status-label">
        {status.label ?? "Using AI toolkit..."}
      </span>
    </div>
  );
}
