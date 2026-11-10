import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { VersionsManager } from "./manager";
import type { VersionsOptions } from "./types";

const managers = new WeakMap<GoTipeEditor, VersionsManager>();
export function getVersionsManager(editor: GoTipeEditor): VersionsManager | undefined {
  return managers.get(editor);
}

export const defineVersions = defineExtension<VersionsOptions>({
  name: "versions",
  options: { autoSave: false, autoSaveInterval: 300000, maxVersions: 100 },
  storageKey: "versions",
  onCreate(editor: GoTipeEditor) {
    const opts = this.options as VersionsOptions;
    const manager = new VersionsManager(editor, opts);
    managers.set(editor, manager);
  },
  onDestroy(editor: GoTipeEditor) {
    managers.get(editor)?.destroy();
    managers.delete(editor);
  },
});
