import type { GoTipeEditor } from "@gotipe/core";

/**
 * The built-in AI controls an editor answers. Each one shows only when an extension of
 * `@gotipe/ai` listens for what it sends: without `defineAi` there is no Improve, no ⌘J,
 * no ghost text and no status line.
 */
export interface AiControls {
  /** Improve sends `rewrite`, which `defineAiContext` answers. */
  improve: boolean;
  /** The ⌘J bar, which Ask AI of `defineAiContext` opens too: something answers its prompt. */
  commandBar: boolean;
  /**
   * What the bar sends without the host's handler: `freeText`, which `defineAiAgent` answers
   * (proofreading, a review or a paragraph), else `askAi`, which `defineAiContext` answers.
   */
  prompt: "freeText" | "askAi";
  /** Ghost text and the status line show what `defineAi` reports. */
  status: boolean;
}

/** `hostPrompt`: the host handles the bar's prompt itself (`onAiCommand`). */
export function aiControls(editor: GoTipeEditor, hostPrompt = false): AiControls {
  const ai = editor.hasExtension("ai");
  const context = editor.hasExtension("ai-context");
  const agent = editor.hasExtension("ai-agent");
  return {
    improve: ai && context,
    commandBar: ai && (hostPrompt || agent || context),
    prompt: agent ? "freeText" : "askAi",
    status: ai,
  };
}
