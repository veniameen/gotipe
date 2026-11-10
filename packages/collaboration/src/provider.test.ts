import { afterEach, describe, expect, it, vi } from "vitest";
import { type Operation, type Update, decodeJSON, encodeJSON, frame, readUpdate } from "./protocol";
import { CollaborationProvider } from "./provider";
import type { CollaborationEditor, CollaborationOptions } from "./types";

class Socket {
  readyState = 0;
  binaryType = "";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Uint8Array[] = [];
  send(value: Uint8Array) {
    this.sent.push(value.slice());
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(kind: number, value?: unknown) {
    const bytes = frame(kind, value === undefined ? undefined : encodeJSON(value));
    this.onmessage?.({ data: bytes.buffer });
  }
  updates(): Update[] {
    return this.sent.filter((data) => data[0] === 3).map((data) => readUpdate(data.subarray(1)));
  }
}
const envelope = (operations: Operation[] = []): Update => ({
  protocol: "gotipe.crdt/1",
  base: { version: 1, blocks: [] },
  operations,
});
const operation = (lamport: number, peer = "alice"): Operation => ({
  id: { lamport, peer_id: peer },
  change: { SetData: { key: "test", value: lamport } },
});
function editorFixture() {
  const events = new Map<string, Set<() => void>>();
  let update = envelope();
  const emit = (name: string) => {
    for (const callback of events.get(name) ?? []) callback();
  };
  const editor: CollaborationEditor = {
    isDestroyed: false,
    enableCollaboration: vi.fn(),
    getCollaborationUpdate: () => encodeJSON(update),
    receiveCollaborationUpdate: vi.fn((bytes) => {
      const incoming = readUpdate(bytes);
      const ops = new Map(
        [...update.operations, ...incoming.operations].map((op) => [JSON.stringify(op.id), op]),
      );
      update = envelope([...ops.values()]);
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
      selection: {
        type: "text",
        anchor: { blockId: "a", offset: 0 },
        head: { blockId: "a", offset: 2 },
      },
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
    change: (op: Operation) => {
      update.operations.push(op);
      emit("update");
    },
  };
}
const providers: CollaborationProvider[] = [];
function fixture(options: Partial<CollaborationOptions> = {}) {
  const sockets: Socket[] = [];
  const urls: string[] = [];
  const protocols: string[][] = [];
  const errors: Error[] = [];
  const fixture = editorFixture();
  const provider = new CollaborationProvider({
    documentId: "document",
    wsUrl: "wss://example.test/sync",
    peerId: "alice",
    user: { name: "Alice", color: "#123456" },
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
  });
  providers.push(provider);
  provider.connect(fixture.editor);
  return { ...fixture, provider, sockets, urls, protocols, errors };
}
afterEach(() => {
  for (const provider of providers.splice(0)) provider.destroy();
  vi.useRealTimers();
});

describe("durable collaboration transport", () => {
  it("authenticates with a protocol credential and waits for engine synchronization", () => {
    const f = fixture({ token: "private-token" });
    const url = new URL(f.urls[0]!);
    expect(url.searchParams.get("document_id")).toBe("document");
    expect(url.searchParams.get("peer_id")).toBe("alice");
    expect(url.toString()).not.toContain("private-token");
    expect(f.protocols[0]).toEqual(["gotipe.v1", "gotipe.auth.cHJpdmF0ZS10b2tlbg"]);
    f.sockets[0]!.open();
    expect(f.provider.getState()).toBe("connecting");
    f.sockets[0]!.receive(2, envelope([operation(1, "bob")]));
    expect(f.editor.receiveCollaborationUpdate).toHaveBeenCalledOnce();
    expect(f.provider.getState()).toBe("connected");
    expect(f.sockets[0]!.updates()).toEqual([]);
  });

  it("sends only unacknowledged operations, one batch at a time", () => {
    const f = fixture();
    const socket = f.sockets[0]!;
    f.change(operation(1));
    socket.open();
    expect(socket.updates()).toHaveLength(0);
    socket.receive(2, envelope());
    f.change(operation(2));
    expect(socket.updates()).toHaveLength(1);
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 2, saving: true });
    socket.receive(9);
    expect(socket.updates().map((update) => update.operations.map((op) => op.id.lamport))).toEqual([
      [1],
      [2],
    ]);
    socket.receive(9);
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 0, saving: false });
  });

  it("reconnects with all unconfirmed edits and deduplicates saved-but-lost ACKs", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const first = f.sockets[0]!;
    first.open();
    first.receive(2, envelope());
    f.change(operation(1));
    first.close();
    f.change(operation(2));
    await vi.advanceTimersByTimeAsync(5);
    const second = f.sockets[1]!;
    second.open();
    second.receive(2, envelope([operation(1)]));
    expect(second.updates()[0]!.operations).toEqual([operation(2)]);
    second.receive(9);
    expect(f.provider.getSyncState().pendingOperations).toBe(0);
    expect(f.errors).toEqual([]);
  });

  it("preserves failed saves and retries only after a fresh handshake", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope());
    f.change(operation(1));
    socket.receive(8, { code: "UPDATE_NOT_SAVED", message: "Storage unavailable" });
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 1, saving: false });
    await vi.advanceTimersByTimeAsync(5);
    const retry = f.sockets[1]!;
    retry.open();
    retry.receive(2, envelope());
    expect(retry.updates()[0]!.operations).toEqual([operation(1)]);
  });

  it("does not reconnect or resurrect a destroyed provider after late credentials", async () => {
    vi.useFakeTimers();
    let resolve!: (token: string) => void;
    const f = fixture({
      token: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    f.provider.destroy();
    resolve("late-token");
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.sockets).toHaveLength(0);
    expect(f.provider.getState()).toBe("disconnected");
  });

  it("intentional disconnect detaches listeners and does not reconnect", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope());
    f.provider.disconnect();
    f.emit("selectionChange");
    f.change(operation(1));
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.sockets).toHaveLength(1);
    expect(f.provider.getState()).toBe("disconnected");
    f.provider.connect(f.editor);
    const next = f.sockets[1]!;
    next.open();
    next.receive(2, envelope());
    expect(next.updates()[0]!.operations).toEqual([operation(1)]);
  });

  it("applies and removes remote presence without changing document content", () => {
    const f = fixture();
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope());
    socket.receive(4, {
      peerId: "bob",
      user: { name: "Bob", color: "#abcdef" },
      cursor: { blockId: "a", offset: 1 },
      lastActive: 100,
    });
    expect(f.provider.getPeers()).toHaveLength(1);
    expect(f.editor.setDecorations).toHaveBeenLastCalledWith("collaboration", [
      expect.objectContaining({ type: "remote-cursor", peerId: "bob" }),
    ]);
    socket.receive(4, { peerId: "bob", removed: true });
    expect(f.provider.getPeers()).toEqual([]);
    expect(socket.updates()).toEqual([]);
    const presence = socket.sent.find((bytes) => bytes[0] === 4)!;
    expect(decodeJSON(presence.subarray(1))).toMatchObject({
      peerId: "alice",
      cursor: { blockId: "a", offset: 2 },
    });
  });

  it("surfaces invalid remote state without silently dropping local edits", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope());
    f.change(operation(1));
    socket.receive(3, { protocol: "wrong", operations: [] });
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.provider.getState()).toBe("error");
    expect(f.errors[0]!.message).toContain("Invalid collaboration");
    expect(f.provider.getSyncState().pendingOperations).toBe(1);
    expect(f.sockets).toHaveLength(1);
  });
});
