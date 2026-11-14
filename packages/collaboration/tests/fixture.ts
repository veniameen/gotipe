import { vi } from "vitest";
import {
  FULL_STATE,
  OPERATIONS,
  type Operation,
  type Update,
  decodeJSON,
  encodeJSON,
  frame,
  readUpdate,
} from "../src/protocol";
import { CollaborationProvider } from "../src/provider";
import type {
  AwarenessUser,
  CollaborationEditor,
  CollaborationOptions,
  CollaborationState,
} from "../src/types";

export class Socket {
  readyState = 0;
  binaryType = "";
  /** The subprotocol the server selected; an old server knows only gotipe.v1. */
  protocol = "";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Uint8Array[] = [];
  /** Bytes queued but not yet handed to the network, as a browser reports it. */
  bufferedAmount = 0;
  /** Called for every frame the provider sends, e.g. to answer like a server. */
  onsend: ((data: Uint8Array) => void) | null = null;
  send(value: Uint8Array) {
    const data = value.slice();
    this.sent.push(data);
    this.onsend?.(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open(protocol = "gotipe.v1") {
    this.protocol = protocol;
    this.readyState = 1;
    this.onopen?.();
  }
  receive(kind: number, value?: unknown) {
    this.receiveRaw(frame(kind, value === undefined ? undefined : encodeJSON(value)));
  }
  receiveRaw(bytes: Uint8Array<ArrayBuffer>) {
    this.onmessage?.({ data: bytes.buffer });
  }
  frames(kind: number): Uint8Array[] {
    return this.sent.filter((data) => data[0] === kind).map((data) => data.subarray(1));
  }
  updates(): Update[] {
    return this.frames(3).map((data) => readUpdate(data));
  }
  /** Update frames as sent, with the fields `readUpdate` does not model. */
  envelopes(): (Update & { generation?: string; continues?: boolean })[] {
    return this.frames(3).map(
      (data) => decodeJSON(data) as Update & { generation?: string; continues?: boolean },
    );
  }
  presence(): Record<string, unknown>[] {
    return this.frames(4).map((data) => decodeJSON(data) as Record<string, unknown>);
  }
}

export const base = { version: 1, blocks: [] };
export const envelope = (operations: Operation[] = [], document: object = base): Update => ({
  protocol: FULL_STATE,
  base: document,
  operations,
});
export const replacedBaseline = {
  version: 0,
  blocks: [{ id: "r1", block_type: "paragraph", attrs: {}, content: { type: "Empty" } }],
};
export const operation = (
  lamport: number,
  peer = "alice",
  value: unknown = lamport,
): Operation => ({
  id: { lamport, peer_id: peer },
  change: { SetData: { key: "test", value } },
});
export const user: AwarenessUser = { name: "Alice", color: "#123456" };
export const state = (generation = "generation-1"): CollaborationState => ({
  baseline: base,
  updates: [],
  generation,
});

const key = (op: Operation) => JSON.stringify([op.id.lamport, op.id.peer_id]);
const ordered = (operations: Iterable<Operation>) =>
  [...operations].sort(
    (a, b) => a.id.lamport - b.id.lamport || (a.id.peer_id < b.id.peer_id ? -1 : 1),
  );
const sameBase = (left: object, right: object) => {
  const { version: _left, ...a } = left as typeof base;
  const { version: _right, ...b } = right as typeof base;
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * The engine's collaboration contract in JavaScript: a replica rejects another
 * baseline and conflicting IDs, reports a remote merge as a selection change, and
 * answers the three forms of `getCollaborationUpdate` like `gotipe-crdt`.
 */
export function editorFixture(peer = "alice", document: object = base) {
  const events = new Map<string, Set<() => void>>();
  const log = new Map<string, Operation>();
  /** Clocks that end a local transaction. */
  const ends = new Set<number>();
  /** The schema: whether a set of operations projects a valid document. */
  let valid = (_operations: Operation[]) => true;
  let selection = { anchor: { blockId: "a", offset: 0 }, head: { blockId: "a", offset: 2 } };
  const reads = { full: 0, local: 0, missing: 0 };
  const emit = (name: string) => {
    for (const callback of events.get(name) ?? []) callback();
  };
  const own = (after: number) =>
    ordered(log.values()).filter((op) => op.id.peer_id === peer && op.id.lamport > after);
  const editor: CollaborationEditor = {
    isDestroyed: false,
    enableCollaboration: vi.fn(),
    getCollaborationUpdate: (options) => {
      if (!options) {
        reads.full++;
        return encodeJSON(envelope(ordered(log.values()), document));
      }
      if ("missingFrom" in options) {
        reads.missing++;
        const remote = new Map(
          readUpdate(options.missingFrom).operations.map((op) => [key(op), op]),
        );
        const acknowledged = Math.max(
          0,
          ...[...remote.values()].filter((op) => op.id.peer_id === peer).map((op) => op.id.lamport),
        );
        const operations = ordered(log.values()).filter(
          (op) => !remote.has(key(op)) && !(op.id.peer_id === peer && op.id.lamport > acknowledged),
        );
        return encodeJSON({ protocol: OPERATIONS, operations, acknowledged });
      }
      reads.local++;
      // Like gotipe-crdt: frames end only after a transaction's last operation.
      const pending = own(options.after);
      const operations: Operation[] = [];
      let size = 64;
      let end = 0;
      let continues = false;
      for (const [index, op] of pending.entries()) {
        size += encodeJSON(op).length + 1;
        if (operations.length && options.maxBytes && size > options.maxBytes) {
          if (end) operations.length = end;
          else continues = true;
          break;
        }
        operations.push(op);
        if (ends.has(op.id.lamport) || index === pending.length - 1) end = operations.length;
      }
      return encodeJSON({
        protocol: OPERATIONS,
        operations,
        remaining: pending.length - operations.length,
        continues,
      });
    },
    receiveCollaborationUpdate: vi.fn((bytes) => {
      const incoming = readUpdate(bytes);
      if (incoming.base && !sameBase(incoming.base, document))
        throw new Error("CRDT error: Peers must start from the same document snapshot");
      const before = log.size;
      for (const op of incoming.operations) {
        const prior = log.get(key(op));
        if (prior && JSON.stringify(prior) !== JSON.stringify(op))
          throw new Error("CRDT error: Conflicting operation identity");
      }
      const next = new Map(log);
      for (const op of incoming.operations) next.set(key(op), op);
      if (!valid(ordered(next.values())))
        throw new Error(
          "Transform error: Invalid step: Schema validation failed: [MissingAttribute]",
        );
      for (const op of incoming.operations) log.set(key(op), op);
      if (log.size === before) return;
      emit("selectionChange");
      emit("update");
    }),
    getViewState: () => ({
      blocks: [],
      decorations: [],
      version: 1,
      toolbar: {
        activeMarks: [],
        activeBlockType: "paragraph",
        activeBlockAttrs: {},
        canUndo: false,
        canRedo: false,
      },
      selection: { type: "text", anchor: { ...selection.anchor }, head: { ...selection.head } },
    }),
    setDecorations: vi.fn(),
    on: (name, callback) => {
      const set = events.get(name) ?? new Set();
      const invoke = () => Reflect.apply(callback, undefined, []);
      set.add(invoke);
      events.set(name, set);
      return () => {
        set.delete(invoke);
      };
    },
  };
  return {
    editor,
    emit,
    /** How often the provider read each form of the update. */
    reads,
    operations: () => ordered(log.values()),
    /** A local edit: the operation enters the log and the editor reports an update. */
    change: (op: Operation) => {
      log.set(key(op), op);
      ends.add(op.id.lamport);
      emit("update");
    },
    /** Sets the check a merged log must pass, like the editor's schema. */
    validate: (check: (operations: Operation[]) => boolean) => {
      valid = check;
    },
    /** One local transaction of several operations. */
    transaction: (operations: Operation[]) => {
      for (const op of operations) log.set(key(op), op);
      ends.add(operations.at(-1)!.id.lamport);
      emit("update");
    },
    /** Operations that were in the editor before the provider saw it, e.g. a local copy. */
    restore: (operations: Operation[]) => {
      for (const op of operations) log.set(key(op), op);
    },
    select: (caret: { blockId: string; offset: number }) => {
      selection = { anchor: caret, head: caret };
      emit("selectionChange");
    },
  };
}

const providers: CollaborationProvider[] = [];
export function destroyProviders(): void {
  for (const provider of providers.splice(0)) provider.destroy();
}
export function track(provider: CollaborationProvider): CollaborationProvider {
  providers.push(provider);
  return provider;
}
export function fixture(options: Partial<CollaborationOptions> = {}, document: object = base) {
  const sockets: Socket[] = [];
  const urls: string[] = [];
  const protocols: string[][] = [];
  const errors: Error[] = [];
  const fixture = editorFixture(options.peerId ?? "alice", document);
  const provider = track(
    new CollaborationProvider({
      documentId: "document",
      wsUrl: "wss://example.test/sync",
      peerId: "alice",
      user,
      reconnectInterval: 5,
      onError: (error) => errors.push(error),
      ...options,
      createWebSocket: (url, subprotocols) => {
        const socket = new Socket();
        sockets.push(socket);
        urls.push(url);
        protocols.push(subprotocols);
        return socket as unknown as WebSocket;
      },
    }),
  );
  provider.connect(fixture.editor);
  return { ...fixture, provider, sockets, urls, protocols, errors };
}
