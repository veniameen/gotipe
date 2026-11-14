import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeJSON, frame } from "../src/protocol";
import { CollaborationProvider } from "../src/provider";
import type { AwarenessUser } from "../src/types";
import {
  destroyProviders,
  editorFixture,
  envelope,
  fixture,
  operation,
  replacedBaseline,
  track,
  user,
} from "./fixture";

afterEach(() => {
  destroyProviders();
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
    // Without a generation the provider speaks the first protocol and asks for the state.
    expect(f.sockets[0]!.frames(1)).toHaveLength(1);
    f.sockets[0]!.receive(2, envelope([operation(1, "bob")]));
    expect(f.editor.receiveCollaborationUpdate).toHaveBeenCalledOnce();
    expect(f.provider.getState()).toBe("connected");
    expect(f.sockets[0]!.updates()).toEqual([]);
  });

  it("sends only unacknowledged operations, one batch at a time", async () => {
    vi.useFakeTimers();
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
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 1, saving: false });
    await vi.advanceTimersByTimeAsync(50);
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

describe("presence", () => {
  it("drops only a peer whose presence is invalid and keeps the document connected", () => {
    const f = fixture();
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope());
    socket.receive(4, { peerId: "bob", user: { name: "Bob", color: "#abcdef" }, lastActive: 1 });
    socket.receive(4, { peerId: "carol", user: { name: "Carol", color: "#123" }, lastActive: 1 });
    socket.receive(4, { peerId: "bob", user: { name: "Bob", color: "red" }, lastActive: 2 });
    socket.receiveRaw(frame(4, new TextEncoder().encode("{not json")));
    expect(f.provider.getState()).toBe("connected");
    expect(f.provider.getPeers().map((peer) => peer.peerId)).toEqual(["carol"]);
    expect(f.errors.map((error) => error.message)).toEqual([
      expect.stringContaining("Ignored invalid presence of bob"),
      expect.stringContaining("Ignored invalid presence"),
    ]);
    f.change(operation(1));
    expect(socket.updates()).toHaveLength(1);
  });

  it("keeps editing when Cloud refuses this replica's presence", () => {
    const f = fixture();
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope());
    socket.receive(8, { code: "INVALID_AWARENESS", message: "awareness user color is invalid" });
    expect(f.provider.getState()).toBe("connected");
    expect(f.errors.map((error) => error.message)).toEqual(["awareness user color is invalid"]);
    f.change(operation(1));
    expect(socket.updates()).toHaveLength(1);
  });

  it("rejects an invalid local user at configuration time and sends only its known fields", () => {
    for (const invalid of [
      { name: "Alice", color: "red" },
      { name: "A".repeat(257), color: "#123" },
      { name: "Alice", color: "#123", avatar: "javascript:alert(1)" },
      { name: "Alice", color: "#123", avatar: `data:image/png;base64,${"A".repeat(16384)}` },
      { name: 1, color: "#123" },
    ])
      expect(
        () =>
          new CollaborationProvider({
            documentId: "document",
            wsUrl: "wss://example.test/sync",
            user: invalid as unknown as AwarenessUser,
          }),
      ).toThrow(TypeError);
    const f = fixture({ user: { ...user, role: "admin" } as AwarenessUser });
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope());
    expect(socket.presence()[0]!.user).toEqual(user);
  });

  it("sends presence only after the local selection changes, at most every 100 ms", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope());
    expect(socket.presence()).toHaveLength(1);
    // Every remote merge is also a selection change in core; the caret did not move.
    for (let lamport = 1; lamport <= 20; lamport++)
      socket.receive(3, envelope([operation(lamport, "bob")]));
    f.emit("focus");
    await vi.advanceTimersByTimeAsync(500);
    expect(socket.presence()).toHaveLength(1);
    for (let offset = 3; offset <= 12; offset++) f.select({ blockId: "a", offset });
    await vi.advanceTimersByTimeAsync(99);
    expect(socket.presence()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.presence()).toHaveLength(2);
    expect(socket.presence()[1]).toMatchObject({ cursor: { blockId: "a", offset: 12 } });
  });

  it("announces presence again after a reconnect even when nothing moved", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const first = f.sockets[0]!;
    first.open();
    first.receive(2, envelope());
    first.close();
    await vi.advanceTimersByTimeAsync(5);
    const second = f.sockets[1]!;
    second.open();
    second.receive(2, envelope());
    expect(second.presence()).toHaveLength(1);
  });
});

describe("baseline replacement", () => {
  it("stops without retrying when Cloud replaced the document and asks the host to reload", async () => {
    vi.useFakeTimers();
    const replaced = vi.fn();
    const f = fixture({ onBaselineReplaced: replaced });
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope());
    f.change(operation(1));
    socket.receive(8, { code: "BASELINE_REPLACED", message: "The document content was replaced." });
    expect(replaced).toHaveBeenCalledOnce();
    expect(f.provider.getState()).toBe("disconnected");
    expect(f.errors).toEqual([]);
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 1, saving: false });
    expect(socket.readyState).toBe(3);
    f.change(operation(2));
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.sockets).toHaveLength(1);
    expect(socket.updates()).toHaveLength(1);
  });

  it("reports the replacement through onError when the host has no reload callback", () => {
    const f = fixture();
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope());
    socket.receive(8, { code: "BASELINE_REPLACED", message: "The document content was replaced." });
    expect(f.provider.getState()).toBe("error");
    expect(f.errors[0]!.message).toContain("replaced");
  });

  it("recognizes a replaced baseline in the handshake after a reconnect", async () => {
    vi.useFakeTimers();
    const replaced = vi.fn();
    const f = fixture({ onBaselineReplaced: replaced });
    const first = f.sockets[0]!;
    first.open();
    first.receive(2, envelope());
    f.change(operation(1));
    first.close();
    await vi.advanceTimersByTimeAsync(5);
    const second = f.sockets[1]!;
    second.open();
    second.receive(2, { protocol: "gotipe.crdt/1", base: replacedBaseline, operations: [] });
    expect(replaced).toHaveBeenCalledOnce();
    expect(f.errors).toEqual([]);
    expect(second.updates()).toEqual([]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.sockets).toHaveLength(2);
  });

  it("still fails on an engine error when the baseline is the same", () => {
    const replaced = vi.fn();
    const f = fixture({ onBaselineReplaced: replaced });
    f.change(operation(1));
    const socket = f.sockets[0]!;
    socket.open();
    const conflicting = { ...operation(1), change: { SetData: { key: "test", value: 99 } } };
    socket.receive(2, envelope([conflicting]));
    expect(replaced).not.toHaveBeenCalled();
    expect(f.provider.getState()).toBe("error");
    expect(f.errors[0]!.message).toContain("Conflicting operation identity");
  });
});

describe("configuration", () => {
  it("rejects permanent endpoint and identity mistakes before connecting", () => {
    for (const wsUrl of [
      "https://example.test/sync",
      "/sync",
      "wss://user:secret@example.test/sync",
      "wss://example.test/sync?token=secret",
    ])
      expect(() => new CollaborationProvider({ documentId: "document", wsUrl, user })).toThrow(
        TypeError,
      );
    for (const peerId of ["p".repeat(257), "Ж".repeat(129), "@base-1", "   "])
      expect(
        () =>
          new CollaborationProvider({
            documentId: "document",
            wsUrl: "wss://example.test/sync",
            user,
            peerId,
          }),
      ).toThrow(TypeError);
  });

  it("does not retry an endpoint the browser refuses for good", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const errors: Error[] = [];
    const provider = new CollaborationProvider({
      documentId: "document",
      wsUrl: "ws://example.test/sync",
      user,
      reconnectInterval: 5,
      onError: (error) => errors.push(error),
      createWebSocket: () => {
        attempts++;
        throw new DOMException("An insecure WebSocket from an HTTPS page", "SecurityError");
      },
    });
    track(provider);
    provider.connect(editorFixture().editor);
    await vi.advanceTimersByTimeAsync(60000);
    expect(attempts).toBe(1);
    expect(provider.getState()).toBe("error");
    expect(errors.map((error) => error.name)).toEqual(["SecurityError"]);
  });
});
