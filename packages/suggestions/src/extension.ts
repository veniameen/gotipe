import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { SuggestionsManager } from "./manager";
import type { SuggestionsOptions } from "./types";

const managers = new WeakMap<GoTipeEditor, SuggestionsManager>();
export function getSuggestionsManager(editor: GoTipeEditor): SuggestionsManager | undefined {
  return managers.get(editor);
}

export const defineSuggestions = defineExtension<SuggestionsOptions>({
  name: "suggestions",
  options: { enabled: false },
  storageKey: "suggestions",
  onCreate(editor: GoTipeEditor) {
    const manager = new SuggestionsManager(editor, this.options as SuggestionsOptions);
    if ((this.options as SuggestionsOptions)?.enabled) {
      manager.enable();
    }
    managers.set(editor, manager);
  },
  onDestroy(editor: GoTipeEditor) {
    managers.get(editor)?.destroy();
    managers.delete(editor);
  },
});
