import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { CommentsManager } from "./manager";
import type { CommentsOptions } from "./types";

const managers = new WeakMap<GoTipeEditor, CommentsManager>();
export function getCommentsManager(editor: GoTipeEditor): CommentsManager | undefined {
  return managers.get(editor);
}

export const defineComments = defineExtension<CommentsOptions>({
  name: "comments",
  options: {},
  storageKey: "comments",
  onCreate(editor: GoTipeEditor) {
    const manager = new CommentsManager(editor, this.options as CommentsOptions);
    managers.set(editor, manager);
  },
  onDestroy(editor: GoTipeEditor) {
    managers.get(editor)?.destroy();
    managers.delete(editor);
  },
});
