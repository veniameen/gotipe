import {
  localAwareness,
  peerDecorations,
  presenceKey,
  presencePeer,
  readAwareness,
  readLocalUser,
} from "./awareness";
import { applyCollaborationState } from "./bootstrap";
import { Outbox, type Receipt } from "./outbox";
import { FramePacer } from "./pacing";
import {
  BASELINE_REPLACED,
  INVALID_AWARENESS,
  UPDATE_NOT_SAVED,
  UPDATE_TOO_LARGE,
  type Update,
  authProtocol,
  decodeJSON,
  encodeJSON,
  frame,
  readServerError,
  readUpdate,
  sameBaseline,
  syncEndpoint,
  unionOf,
  validGeneration,
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
/** How often an upload still in the socket's buffer is checked. */
const UPLOAD_POLL = 250;
/** Relayed updates kept while their union is not yet a valid document. */
const DEFERRED_BYTES = 32 << 20;
/** Subprotocols: `gotipe.v2` sends operations by generation, `gotipe.v1` repeats the baseline. */
const DELTAS = "gotipe.v2";
const BASELINES = "gotipe.v1";

/**
 * Durable operation-log transport. Exactly one update frame awaits each empty
 * server ACK; a frame holds only whole transactions the server has not
 * confirmed. A transaction larger than a message leaves as parts that Cloud
 * acknowledges together.
 */
export class CollaborationProvider {
  readonly peerId: string;
  private readonly endpoint: URL;
  private readonly user: AwarenessUser;
  /** The baseline's name in Cloud; without it only `gotipe.v1` is offered. */
  private readonly generation: string | null;
  private ws: WebSocket | null = null;
  private editor: CollaborationEditor | null = null;
  private state: ConnectionState = "disconnected";
  private peers = new Map<string, PeerState>();
  private readonly outbox = new Outbox();
  private readonly pacer = new FramePacer();
  private inFlight: Receipt | null = null;
  /** The server chose `gotipe.v2` for this connection. */
  private deltas = false;
  /** The frame in flight left operations behind: the next one need not wait. */
  private backlog = false;
  private unsubscribes: (() => void)[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private awarenessTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private uploadTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Relayed updates the editor refused as an invalid document: pieces of an edit
   * a peer had to send in standalone frames. They are merged with later updates
   * until the union is valid. The next full state contains them all.
   */
  private deferred: { update: Update; bytes: number }[] = [];
  /** What peers last received from this connection; null forces the next send. */
  private sentPresence: string | null = null;
  private reconnectAttempts = 0;
  /** Counts connection attempts: a late event of an older socket is ignored. */
  private attempt = 0;
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
    const generation = options.initialState?.generation;
    if (generation !== undefined && !validGeneration(generation))
      throw new TypeError("The collaboration generation must be the token Cloud returned");
    this.generation = generation ?? null;
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
        if (this.receiving) return;
        this.notifySync();
        this.requestFlush();
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
    const attempt = ++this.attempt;
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
      if (attempt === this.attempt && this.active) this.fail(error, true);
      return;
    }
    if (attempt !== this.attempt || !this.active) return;
    const url = new URL(this.endpoint);
    url.searchParams.set("document_id", this.options.documentId);
    url.searchParams.set("peer_id", this.peerId);
    if (this.generation) url.searchParams.set("generation", this.generation);
    const protocols = [
      ...(this.generation ? [DELTAS] : []),
      BASELINES,
      ...(token ? [authProtocol(token)] : []),
    ];
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
    const current = () => attempt === this.attempt && this.active && this.ws === ws;
    ws.onopen = () => {
      if (!current()) return;
      // A server from before generations selects gotipe.v1 and gets baselines again.
      this.deltas = !!this.generation && ws.protocol === DELTAS;
      // Cloud sends the full state on its own; the first protocol also asked for it.
      if (!this.deltas) this.send(0x01);
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
      case 0x02: {
        if (!this.editor || !this.applyRemote(this.editor, payload, true)) return;
        if (this.synchronized) break;
        // Once per connection: what the server lacks and which own clock it confirmed.
        this.outbox.synchronize(this.editor, payload);
        this.clearDeadline();
        this.synchronized = true;
        // Only a saved update proves the connection works: an upload that never
        // completes must still count against maxReconnectAttempts.
        if (!this.outbox.pending(this.editor)) this.reconnectAttempts = 0;
        this.setState("connected");
        this.sendAwareness();
        this.send(0x05);
        this.notifySync();
        // Whatever waited for this connection is a backlog, not a burst of typing.
        this.backlog = true;
        this.requestFlush();
        break;
      }
      case 0x03:
        if (!this.editor) return;
        this.receiveRelayed(this.editor, readUpdate(payload), payload);
        // A merge may add local operations, such as the repair of an inline atom.
        this.notifySync();
        this.requestFlush();
        break;
      case 0x04:
        this.receivePresence(payload);
        break;
      case 0x08: {
        const error = readServerError(payload);
        if (error.code === BASELINE_REPLACED) this.baselineReplaced();
        else if (error.code === UPDATE_TOO_LARGE) {
          // Nothing was saved: send that edit again in standalone frames.
          this.outbox.split();
          this.fail(new Error(error.message), true);
        }
        // Cloud refused this replica's presence only; the document connection stays.
        else if (error.code === INVALID_AWARENESS) this.report(new Error(error.message));
        else this.fail(new Error(error.message), error.code === UPDATE_NOT_SAVED);
        break;
      }
      case 0x09:
        if (payload.length || !this.inFlight)
          throw new Error("Unexpected collaboration acknowledgement");
        this.outbox.acknowledge(this.inFlight);
        this.inFlight = null;
        this.reconnectAttempts = 0;
        this.clearDeadline();
        this.notifySync();
        this.requestFlush();
        break;
      default:
        throw new Error(`Unsupported collaboration message: ${data[0]}`);
    }
  }

  /**
   * Returns false when the server's full state starts from another baseline: the
   * document was replaced while this replica was offline or before it connected.
   * The engine validates the payload; a full state is not parsed here as well.
   */
  private applyRemote(
    editor: CollaborationEditor,
    payload: Uint8Array,
    fullState: boolean,
  ): boolean {
    this.receiving = true;
    try {
      editor.receiveCollaborationUpdate(payload);
      return true;
    } catch (error) {
      if (!fullState || !this.fromAnotherBaseline(editor, payload)) throw error;
      this.baselineReplaced();
      return false;
    } finally {
      this.receiving = false;
    }
  }
  /**
   * A relayed update. One the editor refuses as an invalid document (schema) is a
   * piece of an edit sent in standalone frames; it waits, merged with the
   * following updates, until their union is valid.
   */
  private receiveRelayed(editor: CollaborationEditor, update: Update, payload: Uint8Array): void {
    const bytes = payload.length;
    const pending = this.deferred.length
      ? unionOf([...this.deferred.map((entry) => entry.update), update])
      : payload;
    try {
      this.applyRemote(editor, pending, false);
      this.deferred = [];
    } catch (error) {
      const waiting = this.deferred.reduce((sum, entry) => sum + entry.bytes, bytes);
      const invalidDocument = error instanceof Error && /Schema validation/.test(error.message);
      if (!invalidDocument || waiting > DEFERRED_BYTES) throw error;
      this.deferred.push({ update, bytes });
    }
  }
  private fromAnotherBaseline(editor: CollaborationEditor, payload: Uint8Array): boolean {
    let incoming: object | undefined;
    try {
      incoming = readUpdate(payload).base;
    } catch {
      return false; // Malformed: the engine's own error is the one to report.
    }
    const local = readUpdate(editor.getCollaborationUpdate()).base;
    return !!incoming && !!local && !sameBaseline(incoming, local);
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

  /**
   * Sends the next frame as soon as pacing allows: at once after a pause, one
   * frame per burst of typing, and without the wait while a backlog drains.
   */
  private requestFlush(): void {
    if (this.flushTimer || !this.synchronized || this.inFlight) return;
    const wait = this.pacer.delay(Date.now(), this.backlog);
    if (wait <= 0) {
      this.flush();
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, wait);
  }
  private flush(): void {
    if (!this.editor || this.editor.isDestroyed || !this.synchronized || this.inFlight) return;
    try {
      const next = this.outbox.next(this.editor, this.deltas ? this.generation : null);
      this.backlog = !!next?.backlog;
      if (!next) return;
      // The parts of one transaction leave together; Cloud acknowledges the last.
      for (const payload of next.payloads) {
        if (!this.send(0x03, payload)) return;
        this.pacer.spend(Date.now());
      }
      this.inFlight = next.receipt;
      this.awaitAcknowledgement();
      this.notifySync();
    } catch (error) {
      this.fail(error, false);
    }
  }

  /**
   * The ACK deadline starts once the socket has handed the frames to the network,
   * so a large transaction on a slow uplink is not taken for a lost ACK. An upload
   * that makes no progress for the same time fails like a missing ACK.
   */
  private awaitAcknowledgement(): void {
    const timeout = this.options.acknowledgementTimeout ?? 15000;
    const waitForAck = () =>
      this.armDeadline(timeout, "The server did not confirm saving the update");
    const stalled = () => this.armDeadline(timeout, "The upload of an update made no progress");
    const ws = this.ws;
    let buffered = ws?.bufferedAmount ?? 0;
    if (!ws || !buffered) {
      waitForAck();
      return;
    }
    stalled();
    const poll = () => {
      this.uploadTimer = null;
      if (this.ws !== ws || !this.inFlight) return;
      const now = ws.bufferedAmount ?? 0;
      if (!now) {
        waitForAck();
        return;
      }
      if (now < buffered) {
        buffered = now;
        stalled();
      }
      this.uploadTimer = setTimeout(poll, UPLOAD_POLL);
    };
    this.uploadTimer = setTimeout(poll, UPLOAD_POLL);
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
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.uploadTimer) clearTimeout(this.uploadTimer);
    this.uploadTimer = null;
    // The next full state holds every deferred update.
    this.deferred = [];
    this.sentPresence = null;
    this.synchronized = false;
    this.deltas = false;
    this.backlog = false;
    this.inFlight = null;
    this.outbox.disconnect();
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
    this.attempt++;
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
    this.attempt++;
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
      this.editor && !this.editor.isDestroyed ? this.outbox.pending(this.editor) : 0;
    return { pendingOperations, saving: this.inFlight !== null };
  }
  disconnect(): void {
    this.active = false;
    this.attempt++;
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
  }
}

/** Errors a WebSocket constructor throws for an endpoint the page may never open. */
function permanentSocketError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "SecurityError" || name === "SyntaxError";
}
