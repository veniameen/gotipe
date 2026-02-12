import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { AiManager } from "./manager";
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
    const opts = this.options as AiOptions;
    const manager = new AiManager(editor, opts);
    (editor as unknown as Record<string, unknown>).__aiManager = manager;
  },
  onDestroy(editor: GoTipeEditor) {
    const manager = (editor as unknown as Record<string, unknown>).__aiManager as
      | AiManager
      | undefined;
    manager?.destroy();
  },
});
