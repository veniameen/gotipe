import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { type CollaborationOptions, CollaborationProvider } from "./provider";

export type CollaborationExtensionOptions = CollaborationOptions;

const providers = new WeakMap<GoTipeEditor, CollaborationProvider>();
export function getCollaborationProvider(editor: GoTipeEditor): CollaborationProvider | undefined {
  return providers.get(editor);
}

export const defineCollaboration = defineExtension<CollaborationExtensionOptions>({
  name: "collaboration",
  options: {
    documentId: "",
    wsUrl: "",
    user: { name: "Anonymous", color: "#6366f1" },
  },
  storageKey: "collaboration",
  onCreate(editor: GoTipeEditor) {
    const opts = this.options as CollaborationExtensionOptions;
    if (!opts.wsUrl || !opts.documentId) return;

    const provider = new CollaborationProvider(opts);
    provider.connect(editor);
    providers.set(editor, provider);
  },
  onDestroy(editor: GoTipeEditor) {
    providers.get(editor)?.destroy();
    providers.delete(editor);
  },
});
