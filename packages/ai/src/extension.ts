import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { defineAiAgent } from "./agent";
import { installAutocomplete } from "./autocomplete";
import { defineAiContext } from "./context";
import { AiManager } from "./manager";
import { destroyRuntime, getRuntime, registerRuntime } from "./runtime";
import type { AiOptions } from "./types";

/**
 * The manager `defineAi` created for this editor: the one its commands, ghost text and
 * `cancelAi` use, with the provider they use. `undefined` without the extension and after
 * the editor is destroyed. The extension owns it and releases it with the editor, so do
 * not call `destroy()` on it.
 */
export function getAiManager(editor: GoTipeEditor): AiManager | undefined {
  return getRuntime(editor)?.manager;
}

export const defineAi = defineExtension<AiOptions>({
  name: "ai",
  options: {
    debounceMs: 500,
    maxContextBlocks: 5,
    enableAutoComplete: false,
    enablePiiDetection: false,
  },
  storageKey: "ai",
  onCreate(editor: GoTipeEditor) {
    const manager = new AiManager(editor, this.options ?? {});
    const runtime = registerRuntime(editor, manager);
    runtime.cleanup.push(
      editor.on("executeAiCommand", ({ commandId }) => {
        if (commandId === "cancelAi") manager.cancelPending();
      }),
    );
    if (this.options?.enableAutoComplete)
      runtime.cleanup.push(installAutocomplete(editor, manager, this.options?.debounceMs ?? 500));
  },
  onDestroy: destroyRuntime,
});

export const AiPreset = [defineAi, defineAiContext, defineAiAgent];
