import {
  localAwareness,
  peerDecorations,
  presenceKey,
  presencePeer,
  readAwareness,
  readLocalUser,
} from "./awareness";
import { applyCollaborationState } from "./bootstrap";
import {
  BASELINE_REPLACED,
  INVALID_AWARENESS,
  UPDATE_NOT_SAVED,
  type Update,
  authProtocol,
  decodeJSON,
  encodeJSON,
  frame,
  operationId,
  readServerError,
  readUpdate,
  sameBaseline,
  syncEndpoint,
  validPeerId,
} from "./protocol";
import type {
  AwarenessUser,
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

/** Presence is sent after a change, at most once per interval (trailing). */
const AWARENESS_INTERVAL = 100;

/** Durable operation-log transport. Exactly one update awaits each empty server ACK. */
export class CollaborationProvider {
  readonly peerId: string;
  private readonly endpoint: URL;
  private readonly user: AwarenessUser;
  private ws: WebSocket | null = null;
  private editor: CollaborationEditor | null = null;
  private state: ConnectionState = "disconnected";
  private peers = new Map<string, PeerState>();
  private acknowledged = new Set<string>();
  private inFlight: string[] | null = null;
  private unsubscribes: (() => void)[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private awarenessTimer: ReturnType<typeof setTimeout> | null = null;
  /** What peers last received from this connection; null forces the next send. */
  private sentPresence: string | null = null;
  private reconnectAttempts = 0;
  private generation = 0;
  private active = false;
  private destroyed = false;
  private synchronized = false;
  private receiving = false;
  private bootstrapped = false;

  /** Throws for configuration that can never connect, instead of retrying it. */
  constructor(private options: CollaborationOptions) {
    this.peerId = options.peerId ?? crypto.randomUUID();
    if (!this.peerId || !options.documentId)
      throw new Error("A document and peer identity are required");
    if (!validPeerId(this.peerId))
      throw new TypeError("The peer ID must be at most 256 bytes and not start with @base");
    this.endpoint = syncEndpoint(options.wsUrl);
    this.user = readLocalUser(options.user);
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
      // Core also reports remote updates as selection changes; unchanged presence is not resent.
      editor.on("selectionChange", () => this.scheduleAwareness()),
      editor.on("focus", () => this.scheduleAwareness()),
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
    let token: string | undefined;
    try {
      token =
        typeof this.options.token === "function" ? await this.options.token() : this.options.token;
    } catch (error) {
      if (generation === this.generation && this.active) this.fail(error, true);
      return;
    }
    if (generation !== this.generation || !this.active) return;
    const url = new URL(this.endpoint);
    url.searchParams.set("document_id", this.options.documentId);
    url.searchParams.set("peer_id", this.peerId);
    const protocols = ["gotipe.v1", ...(token ? [authProtocol(token)] : [])];
    let ws: WebSocket;
    try {
      ws =
        this.options.createWebSocket?.(url.toString(), protocols) ??
        new WebSocket(url.toString(), protocols);
    } catch (error) {
      // The browser refuses this endpoint for good: mixed content, a blocked port, a bad URL.
      this.fail(error, !permanentSocketError(error));
      return;
    }
    this.ws = ws;
    ws.binaryType = "arraybuffer";
    const current = () => generation === this.generation && this.active && this.ws === ws;
    ws.onopen = () => {
      if (!current()) return;
      this.send(0x01);
      this.armDeadline(this.options.handshakeTimeout ?? 15000, "Collaboration handshake timed out");
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
  }

  private receive(data: Uint8Array): void {
    if (!data.length) throw new Error("Empty collaboration frame");
    const payload = data.subarray(1);
    switch (data[0]) {
      case 0x02:
      case 0x03: {
        if (!this.editor) return;
        const update = readUpdate(payload);
        if (!this.applyRemote(this.editor, update, payload, data[0] === 0x02)) return;
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
      case 0x04:
        this.receivePresence(payload);
        break;
      case 0x08: {
        const error = readServerError(payload);
        if (error.code === BASELINE_REPLACED) this.baselineReplaced();
        // Cloud refused this replica's presence only; the document connection stays.
        else if (error.code === INVALID_AWARENESS) this.report(new Error(error.message));
        else this.fail(new Error(error.message), error.code === UPDATE_NOT_SAVED);
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

  /**
   * Returns false when the server's full state starts from another baseline: the
   * document was replaced while this replica was offline or before it connected.
   */
  private applyRemote(
    editor: CollaborationEditor,
    update: Update,
    payload: Uint8Array,
    fullState: boolean,
  ): boolean {
    this.receiving = true;
    try {
      editor.receiveCollaborationUpdate(payload);
      return true;
    } catch (error) {
      if (!fullState || sameBaseline(update.base, readUpdate(editor.getCollaborationUpdate()).base))
        throw error;
      this.baselineReplaced();
      return false;
    } finally {
      this.receiving = false;
    }
  }

  /** An invalid presence drops only that peer; it never stops the document. */
  private receivePresence(payload: Uint8Array): void {
    let value: unknown;
    let peer: ReturnType<typeof readAwareness>;
    try {
      value = decodeJSON(payload);
      peer = readAwareness(value);
    } catch (error) {
      const peerId = presencePeer(value);
      if (peerId && peerId !== this.peerId && this.peers.delete(peerId)) this.notifyPeers();
      const reason = error instanceof Error ? error.message : String(error);
      this.report(new Error(`Ignored invalid presence${peerId ? ` of ${peerId}` : ""}: ${reason}`));
      return;
    }
    if (peer.peerId === this.peerId) return;
    if ("removed" in peer) this.peers.delete(peer.peerId);
    else this.peers.set(peer.peerId, peer);
    this.notifyPeers();
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

  private scheduleAwareness(): void {
    if (!this.synchronized || this.awarenessTimer) return;
    this.awarenessTimer = setTimeout(() => {
      this.awarenessTimer = null;
      this.sendAwareness();
    }, AWARENESS_INTERVAL);
  }
  private sendAwareness(): void {
    if (!this.editor || this.editor.isDestroyed || !this.synchronized) return;
    const peer = localAwareness(this.editor, {
      peerId: this.peerId,
      user: this.user,
      lastActive: Date.now(),
    });
    const key = presenceKey(peer);
    if (key === this.sentPresence) return;
    if (this.send(0x04, encodeJSON(peer))) this.sentPresence = key;
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
    if (this.awarenessTimer) clearTimeout(this.awarenessTimer);
    this.awarenessTimer = null;
    this.sentPresence = null;
    this.synchronized = false;
    this.inFlight = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      if (ws.readyState < 2) ws.close();
    }
  }
  /** A failure that leaves the connection and the provider running. */
  private report(error: Error): void {
    this.options.onError?.(error);
  }
  private fail(error: unknown, retry: boolean): void {
    this.generation++;
    this.releaseSocket();
    this.clearPeers();
    this.setState("error");
    this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    if (retry) this.scheduleReconnect();
    else this.stop();
  }
  /**
   * Cloud no longer has this replica's baseline. Reconnecting cannot help, and
   * unconfirmed operations cannot be saved: the host loads the document again.
   */
  private baselineReplaced(): void {
    this.generation++;
    this.releaseSocket();
    this.clearPeers();
    this.stop();
    this.notifySync();
    if (this.options.onBaselineReplaced) {
      this.setState("disconnected");
      this.options.onBaselineReplaced();
      return;
    }
    this.setState("error");
    this.options.onError?.(
      new Error("The document was replaced on the server; load it again to keep editing"),
    );
  }
  private stop(): void {
    this.active = false;
    this.removeSubscriptions();
  }
  private scheduleReconnect(): void {
    if (!this.active || this.destroyed || this.reconnectTimer) return;
    if (this.reconnectAttempts >= (this.options.maxReconnectAttempts ?? 10)) {
      this.stop();
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

/** Errors a WebSocket constructor throws for an endpoint the page may never open. */
function permanentSocketError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "SecurityError" || name === "SyntaxError";
}
