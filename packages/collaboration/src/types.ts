import type { GoTipeEditor } from "@gotipe/core";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";
export interface AwarenessUser {
  name: string;
  color: string;
  avatar?: string;
}
export interface PeerState {
  peerId: string;
  user: AwarenessUser;
  cursor?: { blockId: string; offset: number };
  selection?: { blockId: string; from: number; to: number };
  lastActive: number;
}
/** Narrow adapter port: transport does not own the document, history, or engine. */
export type CollaborationEditor = Pick<
  GoTipeEditor,
  | "enableCollaboration"
  | "getCollaborationUpdate"
  | "receiveCollaborationUpdate"
  | "getViewState"
  | "setDecorations"
  | "on"
  | "isDestroyed"
>;

export interface SyncState {
  pendingOperations: number;
  saving: boolean;
}
export interface CollaborationOptions {
  documentId: string;
  wsUrl: string;
  user: AwarenessUser;
  /** Stable for one editor replica, including reconnects. Separate tabs need separate IDs. */
  peerId?: string;
  /** Replay Cloud GET state before connecting; the editor must be created from its baseline. */
  initialState?: CollaborationState;
  /** Short-lived token; a function is called again on every connection attempt. */
  token?: string | (() => string | Promise<string>);
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  handshakeTimeout?: number;
  acknowledgementTimeout?: number;
  /** Transport injection for non-browser hosts and deterministic contract tests. */
  createWebSocket?: (url: string, protocols: string[]) => WebSocket;
  onStateChange?: (state: ConnectionState) => void;
  onSyncChange?: (state: SyncState) => void;
  onPeersChange?: (peers: PeerState[]) => void;
  /**
   * Cloud replaced the document's content (PATCH with content or a version
   * restore), so this replica's baseline is obsolete. The provider has stopped;
   * operations the server did not confirm cannot be saved. Load the document
   * again and create a new editor and provider from its collaboration state.
   * Without this callback the provider reports the replacement through onError.
   */
  onBaselineReplaced?: () => void;
  /** Failures, including recoverable ones such as an invalid peer presence. */
  onError?: (error: Error) => void;
}

/** Cloud GET response. Create the editor from baseline, then apply every durable update. */
export interface CollaborationState {
  baseline: object;
  updates: unknown[];
}
