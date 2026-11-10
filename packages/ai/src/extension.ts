import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { defineAiAgent } from "./agent";
import { installAutocomplete } from "./autocomplete";
import { defineAiContext } from "./context";
import { AiManager } from "./manager";
import { destroyRuntime, registerRuntime } from "./runtime";
import type { AiOptions } from "./types";

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
