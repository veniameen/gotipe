import type { GoTipeEditor } from "@gotipe/core";

/**
 * The built-in AI controls an editor answers. Each one shows only when an extension of
 * `@gotipe/ai` listens for what it sends: without `defineAi` there is no Improve, no ⌘J,
 * no ghost text and no status line.
 */
export interface AiControls {
  /** Improve sends `rewrite`, which `defineAiContext` answers. */
  improve: boolean;
  /** The ⌘J bar sends `freeText`, which `defineAiAgent` answers, unless the host takes the prompt. */
  commandBar: boolean;
  /** Ghost text and the status line show what `defineAi` reports. */
  status: boolean;
}

/** `hostPrompt`: the host handles the bar's prompt itself (`onAiCommand`). */
export function aiControls(editor: GoTipeEditor, hostPrompt = false): AiControls {
  const ai = editor.hasExtension("ai");
  return {
    improve: ai && editor.hasExtension("ai-context"),
    commandBar: ai && (hostPrompt || editor.hasExtension("ai-agent")),
    status: ai,
  };
}
