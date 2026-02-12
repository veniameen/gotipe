import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { SuggestionsManager } from "./manager";
import type { SuggestionsOptions } from "./types";

export const defineSuggestions = defineExtension<SuggestionsOptions>({
  name: "suggestions",
  options: { enabled: false },
  storageKey: "suggestions",
  onCreate(editor: GoTipeEditor) {
    const manager = new SuggestionsManager(editor);
    if ((this.options as SuggestionsOptions)?.enabled) {
      manager.enable();
    }
    (editor as unknown as Record<string, unknown>).__suggestionsManager = manager;
  },
  onDestroy(editor: GoTipeEditor) {
    const manager = (editor as unknown as Record<string, unknown>).__suggestionsManager as
      | SuggestionsManager
      | undefined;
    manager?.destroy();
  },
});
