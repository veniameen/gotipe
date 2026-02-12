import { type GoTipeEditor, defineExtension } from "@gotipe/core";
import { type AwarenessUser, type CollaborationOptions, CollaborationProvider } from "./provider";

export interface CollaborationExtensionOptions {
  documentId: string;
  wsUrl: string;
  user: AwarenessUser;
  token?: string;
  onStateChange?: CollaborationOptions["onStateChange"];
  onPeersChange?: CollaborationOptions["onPeersChange"];
  onError?: CollaborationOptions["onError"];
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

    const provider = new CollaborationProvider({
      documentId: opts.documentId,
      wsUrl: opts.wsUrl,
      user: opts.user,
      token: opts.token,
      onStateChange: opts.onStateChange,
      onPeersChange: opts.onPeersChange,
      onError: opts.onError,
    });

    provider.connect(editor);

    // Store provider for later access
    (editor as unknown as Record<string, unknown>).__collaborationProvider = provider;
  },
  onDestroy(editor: GoTipeEditor) {
    const provider = (editor as unknown as Record<string, unknown>).__collaborationProvider as
      | CollaborationProvider
      | undefined;
    provider?.destroy();
  },
});
