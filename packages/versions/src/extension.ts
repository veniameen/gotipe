import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { VersionsManager } from "./manager";
import type { VersionsOptions } from "./types";

export const defineVersions = defineExtension<VersionsOptions>({
  name: "versions",
  options: { autoSave: false, autoSaveInterval: 300000, maxVersions: 100 },
  storageKey: "versions",
  onCreate(editor: GoTipeEditor) {
    const opts = this.options as VersionsOptions;
    const manager = new VersionsManager(editor, opts);
    (editor as unknown as Record<string, unknown>).__versionsManager = manager;
  },
  onDestroy(editor: GoTipeEditor) {
    const manager = (editor as unknown as Record<string, unknown>).__versionsManager as
      | VersionsManager
      | undefined;
    manager?.destroy();
  },
});
