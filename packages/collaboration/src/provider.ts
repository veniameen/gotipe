import { localAwareness, peerDecorations, readAwareness } from "./awareness";
import { applyCollaborationState } from "./bootstrap";
import { authProtocol, decodeJSON, encodeJSON, frame, operationId, readUpdate } from "./protocol";
import type {
  CollaborationEditor,
  CollaborationOptions,
  ConnectionState,
  PeerState,
  SyncState,
} from "./types";
export type {
  AwarenessUser,
  CollaborationOptions,
  ConnectionState,
  PeerState,
  SyncState,
} from "./types";

/** Durable operation-log transport. Exactly one update awaits each empty server ACK. */
export class CollaborationProvider {
  readonly peerId: string;
  private ws: WebSocket | null = null;
  private editor: CollaborationEditor | null = null;
  private state: ConnectionState = "disconnected";
  private peers = new Map<string, PeerState>();
  private acknowledged = new Set<string>();
  private inFlight: string[] | null = null;
  private unsubscribes: (() => void)[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private generation = 0;
  private active = false;
  private destroyed = false;
  private synchronized = false;
  private receiving = false;
  private bootstrapped = false;

  constructor(private options: CollaborationOptions) {
    this.peerId = options.peerId ?? crypto.randomUUID();
    if (!this.peerId || !options.documentId)
      throw new Error("A document and peer identity are required");
  }

  connect(editor: CollaborationEditor): void {
    if (this.destroyed) throw new Error("The collaboration provider has been destroyed");
    if (this.editor && this.editor !== editor)
      throw new Error("A collaboration provider belongs to one editor replica");
    if (editor.isDestroyed) throw new Error("The editor has been destroyed");
    if (this.active) return;
    if (!this.bootstrapped && this.options.initialState)
      applyCollaborationState(editor, this.options.initialState, this.peerId);
    editor.enableCollaboration(this.peerId);
    this.bootstrapped = true;
    this.editor = editor;
    this.active = true;
    this.reconnectAttempts = 0;
    this.unsubscribes = [
      editor.on("update", () => {
        if (!this.receiving) this.flush();
      }),
      editor.on("selectionChange", () => this.sendAwareness()),
      editor.on("focus", () => this.sendAwareness()),
      editor.on("destroy", () => this.destroy()),
    ];
    void this.open();
  }

  private async open(): Promise<void> {
    if (!this.active || this.destroyed) return;
    const generation = ++this.generation;
    this.synchronized = false;
    this.setState("connecting");
    this.armDeadline(
      this.options.handshakeTimeout ?? 15000,
      "Collaboration credentials or connection timed out",
    );
    try {
      const token =
        typeof this.options.token === "function" ? await this.options.token() : this.options.token;
      if (generation !== this.generation || !this.active) return;
      const url = new URL(this.options.wsUrl);
      if (url.protocol !== "ws:" && url.protocol !== "wss:")
        throw new Error("Expected a ws: or wss: collaboration URL");
      if (url.username || url.password || url.searchParams.has("token"))
        throw new Error("Use the token option instead of URL credentials");
      url.searchParams.set("document_id", this.options.documentId);
      url.searchParams.set("peer_id", this.peerId);
      const protocols = ["gotipe.v1", ...(token ? [authProtocol(token)] : [])];
      const ws =
        this.options.createWebSocket?.(url.toString(), protocols) ??
        new WebSocket(url.toString(), protocols);
      this.ws = ws;
      ws.binaryType = "arraybuffer";
      const current = () => generation === this.generation && this.active && this.ws === ws;
      ws.onopen = () => {
        if (!current()) return;
        this.send(0x01);
        this.armDeadline(
          this.options.handshakeTimeout ?? 15000,
          "Collaboration handshake timed out",
        );
      };
      ws.onmessage = (event) => {
        if (!current()) return;
        try {
          if (!(event.data instanceof ArrayBuffer))
            throw new Error("Expected a binary collaboration frame");
          this.receive(new Uint8Array(event.data));
        } catch (error) {
          this.fail(error, false);
        }
      };
      ws.onerror = () => {
        if (current()) this.fail(new Error("WebSocket connection failed"), true);
      };
      ws.onclose = () => {
        if (!current()) return;
        this.releaseSocket();
        this.clearPeers();
        this.setState("disconnected");
        this.notifySync();
        this.scheduleReconnect();
      };
      this.armDeadline(this.options.handshakeTimeout ?? 15000, "WebSocket connection timed out");
    } catch (error) {
      if (generation === this.generation && this.active) this.fail(error, true);
    }
  }

  private receive(data: Uint8Array): void {
    if (!data.length) throw new Error("Empty collaboration frame");
    const payload = data.subarray(1);
    switch (data[0]) {
      case 0x02:
      case 0x03: {
        if (!this.editor) return;
        const update = readUpdate(payload);
        this.receiving = true;
        try {
          this.editor.receiveCollaborationUpdate(payload);
        } finally {
          this.receiving = false;
        }
        for (const operation of update.operations) this.acknowledged.add(operationId(operation));
        if (data[0] === 0x02 && !this.synchronized) {
          this.clearDeadline();
          this.synchronized = true;
          this.reconnectAttempts = 0;
          this.setState("connected");
          this.sendAwareness();
          this.send(0x05);
        }
        this.flush();
        break;
      }
      case 0x04: {
        const peer = readAwareness(decodeJSON(payload));
        if (peer.peerId === this.peerId) return;
        if ("removed" in peer) this.peers.delete(peer.peerId);
        else this.peers.set(peer.peerId, peer);
        this.notifyPeers();
        break;
      }
      case 0x08: {
        const error = decodeJSON(payload) as { code?: string; message?: string };
        this.fail(
          new Error(error.message ?? "The collaboration server rejected the update"),
          error.code === "UPDATE_NOT_SAVED",
        );
        break;
      }
      case 0x09:
        if (payload.length || !this.inFlight)
          throw new Error("Unexpected collaboration acknowledgement");
        for (const id of this.inFlight) this.acknowledged.add(id);
        this.inFlight = null;
        this.clearDeadline();
        this.flush();
        break;
      default:
        throw new Error(`Unsupported collaboration message: ${data[0]}`);
    }
  }

  private flush(): void {
    if (!this.editor || this.editor.isDestroyed) return;
    try {
      const update = readUpdate(this.editor.getCollaborationUpdate());
      const operations = update.operations.filter(
        (operation) => !this.acknowledged.has(operationId(operation)),
      );
      if (this.synchronized && !this.inFlight && operations.length) {
        this.inFlight = operations.map(operationId);
        if (this.send(0x03, encodeJSON({ ...update, operations })))
          this.armDeadline(
            this.options.acknowledgementTimeout ?? 15000,
            "The server did not confirm saving the update",
          );
        else this.inFlight = null;
      }
      this.notifySync();
    } catch (error) {
      this.fail(error, false);
    }
  }

  private sendAwareness(): void {
    if (!this.editor || !this.synchronized) return;
    const peer = localAwareness(this.editor, {
      peerId: this.peerId,
      user: this.options.user,
      lastActive: Date.now(),
    });
    this.send(0x04, encodeJSON(peer));
  }
  private send(kind: number, payload?: Uint8Array): boolean {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(frame(kind, payload));
    return true;
  }
  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }
  private notifySync(): void {
    this.options.onSyncChange?.(this.getSyncState());
  }
  private notifyPeers(): void {
    const peers = this.getPeers();
    if (this.editor && !this.editor.isDestroyed)
      this.editor.setDecorations("collaboration", peerDecorations(peers));
    this.options.onPeersChange?.(peers);
  }
  private clearPeers(): void {
    this.peers.clear();
    this.notifyPeers();
  }
  private clearDeadline(): void {
    if (this.deadline) clearTimeout(this.deadline);
    this.deadline = null;
  }
  private armDeadline(duration: number, message: string): void {
    this.clearDeadline();
    this.deadline = setTimeout(() => this.fail(new Error(message), true), Math.max(1, duration));
  }
  private releaseSocket(): void {
    this.clearDeadline();
    this.synchronized = false;
    this.inFlight = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      if (ws.readyState < 2) ws.close();
    }
  }
  private fail(error: unknown, retry: boolean): void {
    this.generation++;
    this.releaseSocket();
    this.clearPeers();
    this.setState("error");
    this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    if (retry) this.scheduleReconnect();
    else {
      this.active = false;
      this.removeSubscriptions();
    }
  }
  private scheduleReconnect(): void {
    if (!this.active || this.destroyed || this.reconnectTimer) return;
    if (this.reconnectAttempts >= (this.options.maxReconnectAttempts ?? 10)) {
      this.active = false;
      this.removeSubscriptions();
      this.setState("error");
      this.options.onError?.(
        new Error("Collaboration reconnect attempts exhausted; local edits remain in the editor"),
      );
      return;
    }
    const delay = Math.min(
      (this.options.reconnectInterval ?? 1000) * 2 ** this.reconnectAttempts++,
      30000,
    );
    this.reconnectTimer = setTimeout(
      () => {
        this.reconnectTimer = null;
        void this.open();
      },
      Math.max(0, delay),
    );
  }
  private removeSubscriptions(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes = [];
  }
  getState(): ConnectionState {
    return this.state;
  }
  getPeers(): PeerState[] {
    return structuredClone([...this.peers.values()]);
  }
  getSyncState(): SyncState {
    const pendingOperations =
      this.editor && !this.editor.isDestroyed
        ? readUpdate(this.editor.getCollaborationUpdate()).operations.filter(
            (op) => !this.acknowledged.has(operationId(op)),
          ).length
        : 0;
    return { pendingOperations, saving: this.inFlight !== null };
  }
  disconnect(): void {
    this.active = false;
    this.generation++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.removeSubscriptions();
    this.releaseSocket();
    this.clearPeers();
    this.setState("disconnected");
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.disconnect();
    this.editor = null;
    this.acknowledged.clear();
  }
}
