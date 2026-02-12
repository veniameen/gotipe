import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { CommentsManager } from "./manager";
import type { CommentsOptions } from "./types";

export const defineComments = defineExtension<CommentsOptions>({
  name: "comments",
  options: {},
  storageKey: "comments",
  onCreate(editor: GoTipeEditor) {
    const manager = new CommentsManager(editor);
    (editor as unknown as Record<string, unknown>).__commentsManager = manager;
  },
  onDestroy(editor: GoTipeEditor) {
    const manager = (editor as unknown as Record<string, unknown>).__commentsManager as
      | CommentsManager
      | undefined;
    manager?.destroy();
  },
});
