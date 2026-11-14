import { afterEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_LIMIT, type Operation, decodeJSON } from "../src/protocol";
import { CollaborationProvider } from "../src/provider";
import {
  type Socket,
  base,
  destroyProviders,
  envelope,
  fixture,
  operation,
  state,
  user,
} from "./fixture";

afterEach(() => {
  destroyProviders();
  vi.useRealTimers();
});

/** A stored document with an embedded image: larger than a WebSocket message may be. */
const largeBase = {
  version: 1,
  blocks: [
    {
      id: "image",
      block_type: "image",
      attrs: { src: `data:image/png;base64,${"A".repeat(MESSAGE_LIMIT + 4096)}` },
      content: { type: "Empty" },
      children: [],
    },
  ],
};
const ids = (operations: Operation[]) =>
  operations.map((op) => `${op.id.peer_id}:${op.id.lamport}`);
const continues = (data: Uint8Array) =>
  (decodeJSON(data.subarray(1)) as { continues?: boolean }).continues === true;
/** Answers every transaction with an ACK, like a server that saved it with its last part. */
function acknowledge(socket: Socket, after = 0): void {
  socket.onsend = (data) => {
    if (data[0] === 3 && !continues(data)) setTimeout(() => socket.receive(9), after);
  };
}
/** Operations of `count` × `size` characters: one local transaction of that size. */
const transaction = (from: number, count: number, size: number) =>
  Array.from({ length: count }, (_, index) => operation(from + index, "alice", "т".repeat(size)));

describe("operations by generation", () => {
  it("connects with the generation and sends operations without the baseline", () => {
    const f = fixture({ initialState: state("generation-1"), token: "private-token" });
    const url = new URL(f.urls[0]!);
    expect(url.searchParams.get("generation")).toBe("generation-1");
    expect(f.protocols[0]).toEqual(["gotipe.v2", "gotipe.v1", "gotipe.auth.cHJpdmF0ZS10b2tlbg"]);
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    // Cloud sends the full state itself: no request, and no second copy of the state.
    expect(socket.frames(1)).toEqual([]);
    socket.receive(2, envelope([operation(1, "bob")]));
    expect(f.provider.getState()).toBe("connected");
    f.change(operation(2));
    expect(socket.envelopes()).toEqual([
      { protocol: "gotipe.crdt/2", generation: "generation-1", operations: [operation(2)] },
    ]);
  });

  it("keeps a frame small in a document larger than the message limit", () => {
    const f = fixture({ initialState: { ...state(), baseline: largeBase } }, largeBase);
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    socket.receive(2, envelope([], largeBase));
    f.change(operation(1));
    socket.receive(9);
    expect(socket.frames(3)).toHaveLength(1);
    expect(socket.frames(3)[0]!.length).toBeLessThan(512);
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 0, saving: false });
  });

  it("does not read the whole log for an edit, a status or an acknowledgement", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    socket.receive(2, envelope());
    acknowledge(socket);
    f.reads.full = 0;
    for (let lamport = 1; lamport <= 40; lamport++) {
      f.change(operation(lamport));
      f.provider.getSyncState();
      await vi.advanceTimersByTimeAsync(60);
    }
    expect(f.reads.full).toBe(0);
    // Every frame holds only what the server has not confirmed: one new operation.
    expect(socket.updates().map((update) => ids(update.operations))).toEqual(
      Array.from({ length: 40 }, (_, index) => [`alice:${index + 1}`]),
    );
  });

  it("drains a long offline session in ordered frames under the limit, one at a time", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const first = f.sockets[0]!;
    first.open("gotipe.v2");
    first.receive(2, envelope());
    first.close();
    // About 4 MiB of edits while offline: four times what one message may hold.
    const text = "офлайн 😀 ".repeat(40);
    for (let lamport = 1; lamport <= 9000; lamport++) f.change(operation(lamport, "alice", text));
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 9000, saving: false });
    await vi.advanceTimersByTimeAsync(5);
    const socket = f.sockets[1]!;
    socket.open("gotipe.v2");
    let inFlight = 0;
    let overlap = false;
    socket.onsend = (data) => {
      if (data[0] !== 3) return;
      overlap ||= ++inFlight > 1;
      setTimeout(() => {
        inFlight--;
        socket.receive(9);
      }, 1);
    };
    socket.receive(2, envelope());
    await vi.advanceTimersByTimeAsync(60_000);
    const frames = socket.frames(3);
    expect(frames.length).toBeGreaterThan(7);
    expect(Math.max(...frames.map((data) => data.length))).toBeLessThanOrEqual(MESSAGE_LIMIT / 2);
    expect(overlap).toBe(false);
    const sent = socket.updates().flatMap((update) => update.operations.map((op) => op.id.lamport));
    expect(sent).toEqual(Array.from({ length: 9000 }, (_, index) => index + 1));
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 0, saving: false });
    expect(f.errors).toEqual([]);
  });

  it("resends after a reconnect only what the handshake does not confirm", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const first = f.sockets[0]!;
    first.open("gotipe.v2");
    first.receive(2, envelope());
    f.change(operation(1));
    first.receive(9);
    f.change(operation(2));
    await vi.advanceTimersByTimeAsync(50);
    // The server saved the second frame; its ACK was lost with the connection.
    expect(ids(first.updates()[1]!.operations)).toEqual(["alice:2"]);
    first.close();
    f.change(operation(3));
    await vi.advanceTimersByTimeAsync(5);
    const second = f.sockets[1]!;
    second.open("gotipe.v2");
    second.receive(2, envelope([operation(1), operation(2)]));
    expect(second.updates().map((update) => ids(update.operations))).toEqual([["alice:3"]]);
    second.receive(9);
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 0, saving: false });
  });

  it("sends operations restored under another peer ID once, before its own", async () => {
    vi.useFakeTimers();
    // A local copy of a closed tab: the server saved its first two operations only.
    const copy = [1, 2, 3, 4].map((lamport) => operation(lamport, "old-tab"));
    const local = envelope(copy);
    const f = fixture({ initialState: { ...state(), updates: [local] } });
    expect(f.operations()).toEqual(copy);
    f.change(operation(5));
    const first = f.sockets[0]!;
    first.open("gotipe.v2");
    first.receive(2, envelope(copy.slice(0, 2)));
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 3, saving: true });
    expect(first.updates().map((update) => ids(update.operations))).toEqual([
      ["old-tab:3", "old-tab:4"],
    ]);
    first.receive(9);
    await vi.advanceTimersByTimeAsync(50);
    expect(ids(first.updates()[1]!.operations)).toEqual(["alice:5"]);
    first.receive(9);
    f.change(operation(6));
    await vi.advanceTimersByTimeAsync(50);
    expect(first.updates()).toHaveLength(3);
    expect(ids(first.updates()[2]!.operations)).toEqual(["alice:6"]);
    // A new connection confirms them: nothing restored is sent a second time.
    first.close();
    await vi.advanceTimersByTimeAsync(5);
    const second = f.sockets[1]!;
    second.open("gotipe.v2");
    second.receive(2, envelope([...copy, operation(5), operation(6)]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(second.updates()).toEqual([]);
    expect(f.reads.missing).toBe(2);
  });

  it("sends a large restored copy as one transaction in parts under the limit", async () => {
    vi.useFakeTimers();
    const text = "копия 😀 ".repeat(60);
    const copy = Array.from({ length: 3000 }, (_, index) => operation(index + 1, "old-tab", text));
    const f = fixture({ initialState: { ...state(), updates: [envelope(copy)] } });
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    acknowledge(socket, 1);
    socket.receive(2, envelope());
    await vi.advanceTimersByTimeAsync(10_000);
    const frames = socket.frames(3);
    expect(frames.length).toBeGreaterThan(2);
    expect(Math.max(...frames.map((data) => data.length))).toBeLessThanOrEqual(MESSAGE_LIMIT / 2);
    // Where the closed tab's transactions ended is unknown: all parts but the last continue.
    expect(socket.envelopes().map((update) => update.continues === true)).toEqual(
      frames.map((_, index) => index < frames.length - 1),
    );
    expect(socket.updates().flatMap((update) => ids(update.operations))).toEqual(ids(copy));
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 0, saving: false });
    expect(f.errors).toEqual([]);
  });

  it("never ends a frame inside a transaction", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    socket.receive(2, envelope());
    acknowledge(socket);
    f.change(operation(1));
    // 300 KiB of typing, then a 300 KiB transaction: together more than a frame.
    for (let lamport = 2; lamport <= 31; lamport++)
      f.change(operation(lamport, "alice", "ж".repeat(5000)));
    f.transaction(transaction(32, 30, 5000));
    await vi.advanceTimersByTimeAsync(1000);
    const sent = socket.updates().map((update) => update.operations.map((op) => op.id.lamport));
    expect(sent.flat()).toEqual(Array.from({ length: 61 }, (_, index) => index + 1));
    // The transaction 32–61 is in one frame, never split between two.
    expect(sent.filter((frame) => frame.includes(32) || frame.includes(61))).toHaveLength(1);
    expect(socket.envelopes().some((update) => update.continues)).toBe(false);
  });

  it("sends a transaction larger than a frame whole when one message holds it", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    socket.receive(2, envelope());
    acknowledge(socket);
    f.transaction(transaction(1, 70, 5000)); // About 700 KiB.
    await vi.advanceTimersByTimeAsync(1000);
    const frames = socket.frames(3);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.length).toBeGreaterThan(MESSAGE_LIMIT / 2);
    expect(frames[0]!.length).toBeLessThan(MESSAGE_LIMIT);
    expect(continues(socket.sent.find((data) => data[0] === 3)!)).toBe(false);
  });

  it("sends a transaction larger than a message in parts that one ACK confirms", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    socket.receive(2, envelope());
    // A 6,000-character paste is about 1.25 MiB of operations.
    f.transaction(transaction(1, 250, 5000));
    await vi.advanceTimersByTimeAsync(1000);
    const parts = socket.envelopes();
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.map((part) => part.continues === true)).toEqual(
      parts.map((_, index) => index < parts.length - 1),
    );
    expect(Math.max(...socket.frames(3).map((data) => data.length))).toBeLessThan(MESSAGE_LIMIT);
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 250, saving: true });
    socket.receive(9);
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 0, saving: false });
    expect(f.errors).toEqual([]);
  });

  it("sends the whole transaction again after a disconnect between its parts", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const first = f.sockets[0]!;
    first.open("gotipe.v2");
    first.receive(2, envelope());
    f.transaction(transaction(1, 250, 5000));
    await vi.advanceTimersByTimeAsync(10);
    const parts = first.frames(3).length;
    // The server dropped the parts with the connection and saved nothing.
    first.close();
    await vi.advanceTimersByTimeAsync(5);
    const second = f.sockets[1]!;
    second.open("gotipe.v2");
    acknowledge(second);
    second.receive(2, envelope());
    await vi.advanceTimersByTimeAsync(1000);
    expect(second.frames(3)).toHaveLength(parts);
    expect(second.updates().flatMap((update) => update.operations)).toHaveLength(250);
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 0, saving: false });
  });

  it("sends an edit the server cannot take whole in standalone frames", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const first = f.sockets[0]!;
    first.open("gotipe.v2");
    first.receive(2, envelope());
    f.transaction(transaction(1, 250, 5000));
    await vi.advanceTimersByTimeAsync(10);
    first.receive(8, {
      code: "UPDATE_TOO_LARGE",
      message: "The transaction exceeds the server's limit.",
    });
    await vi.advanceTimersByTimeAsync(5);
    // Nothing was saved; the edit goes again, in frames the server takes one by one.
    const second = f.sockets[1]!;
    second.open("gotipe.v2");
    acknowledge(second);
    second.receive(2, envelope());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(second.frames(3).length).toBeGreaterThan(2);
    expect(second.envelopes().some((update) => update.continues)).toBe(false);
    expect(second.updates().flatMap((update) => update.operations)).toHaveLength(250);
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 0, saving: false });
    expect(f.errors.map((error) => error.message)).toEqual([
      "The transaction exceeds the server's limit.",
    ]);
    // Later edits are whole transactions again.
    f.transaction(transaction(251, 3, 10));
    await vi.advanceTimersByTimeAsync(100);
    expect(ids(second.updates().at(-1)!.operations)).toEqual([
      "alice:251",
      "alice:252",
      "alice:253",
    ]);
  });

  it("stops when the document's stored state would become unreadable", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    socket.receive(2, envelope());
    f.change(operation(1));
    socket.receive(8, { code: "DOCUMENT_TOO_LARGE", message: "Too large to read." });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.provider.getState()).toBe("error");
    expect(f.sockets).toHaveLength(1);
  });

  it("starts the ACK deadline once a slow upload has left the socket", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state(), acknowledgementTimeout: 15_000 });
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    socket.receive(2, envelope());
    socket.onsend = (data) => {
      if (data[0] === 3) socket.bufferedAmount += data.length;
    };
    f.transaction(transaction(1, 250, 5000));
    await vi.advanceTimersByTimeAsync(10);
    // A slow uplink: 40 s to upload, far more than the ACK deadline.
    const step = Math.ceil(socket.bufferedAmount / 40);
    for (let second = 0; second < 40; second++) {
      await vi.advanceTimersByTimeAsync(1000);
      socket.bufferedAmount = Math.max(0, socket.bufferedAmount - step);
    }
    await vi.advanceTimersByTimeAsync(5000);
    socket.receive(9);
    expect(f.sockets).toHaveLength(1);
    expect(f.errors).toEqual([]);
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 0, saving: false });
  });

  it("reconnects when an upload makes no progress, and gives up after the attempts", async () => {
    vi.useFakeTimers();
    const f = fixture({
      initialState: state(),
      acknowledgementTimeout: 1000,
      maxReconnectAttempts: 2,
    });
    f.transaction(transaction(1, 250, 5000));
    for (let attempt = 0; attempt < 3; attempt++) {
      const socket = f.sockets[attempt]!;
      socket.onsend = (data) => {
        if (data[0] === 3) socket.bufferedAmount += data.length;
      };
      socket.open("gotipe.v2");
      socket.receive(2, envelope());
      // Handshakes succeed, but the upload never leaves the buffer.
      await vi.advanceTimersByTimeAsync(10_000);
    }
    expect(f.sockets).toHaveLength(3);
    expect(f.errors.at(-1)!.message).toContain("reconnect attempts exhausted");
    expect(f.errors[0]!.message).toContain("made no progress");
  });

  it("keeps a relayed piece of an edit until the document it completes is valid", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    // Like a heading and its level: one without the other is no valid document.
    f.validate(
      (operations) =>
        operations.some((op) => op.id.lamport === 1) ===
        operations.some((op) => op.id.lamport === 2),
    );
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    socket.receive(2, envelope());
    socket.receive(3, { protocol: "gotipe.crdt/2", operations: [operation(1, "bob")] });
    expect(f.operations()).toEqual([]);
    socket.receive(3, { protocol: "gotipe.crdt/2", operations: [operation(2, "bob")] });
    expect(ids(f.operations())).toEqual(["bob:1", "bob:2"]);
    expect(f.errors).toEqual([]);
    expect(f.provider.getState()).toBe("connected");
  });

  it("sends the whole transaction again after the server refused one of its parts", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const first = f.sockets[0]!;
    first.open("gotipe.v2");
    first.receive(2, envelope());
    f.transaction(transaction(1, 250, 5000));
    await vi.advanceTimersByTimeAsync(10);
    const parts = first.frames(3).length;
    first.receive(8, { code: "UPDATE_NOT_SAVED", message: "Not saved." });
    await vi.advanceTimersByTimeAsync(5);
    const second = f.sockets[1]!;
    second.open("gotipe.v2");
    acknowledge(second);
    second.receive(2, envelope());
    await vi.advanceTimersByTimeAsync(1000);
    expect(second.frames(3)).toHaveLength(parts);
    expect(second.updates().flatMap((update) => update.operations)).toHaveLength(250);
  });

  it("stops with an error for one operation no message can carry", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    socket.receive(2, envelope());
    f.change(operation(1, "alice", "A".repeat(MESSAGE_LIMIT)));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(socket.frames(3)).toEqual([]);
    expect(f.errors.map((error) => error.message)).toEqual([
      expect.stringContaining("exceeds the collaboration message limit"),
    ]);
    expect(f.provider.getState()).toBe("error");
    expect(f.provider.getSyncState().pendingOperations).toBe(1);
    expect(f.sockets).toHaveLength(1);
  });

  it("treats a refused generation at the handshake as a replaced baseline", async () => {
    vi.useFakeTimers();
    const replaced = vi.fn();
    const f = fixture({ initialState: state("old-generation"), onBaselineReplaced: replaced });
    f.change(operation(1));
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    socket.receive(8, { code: "BASELINE_REPLACED", message: "The document content was replaced." });
    expect(replaced).toHaveBeenCalledOnce();
    expect(socket.frames(3)).toEqual([]);
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 1, saving: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.sockets).toHaveLength(1);
  });

  it("rejects a generation that is not a token", () => {
    for (const generation of ["", "two words", "a".repeat(129), 7])
      expect(
        () =>
          new CollaborationProvider({
            documentId: "document",
            wsUrl: "wss://example.test/sync",
            user,
            initialState: { baseline: base, updates: [], generation: generation as string },
          }),
      ).toThrow(TypeError);
  });
});

describe("the first protocol", () => {
  it("still sends baselines to a server that selects gotipe.v1", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const socket = f.sockets[0]!;
    socket.open("gotipe.v1");
    expect(socket.frames(1)).toHaveLength(1);
    socket.receive(2, envelope([operation(1, "bob")]));
    f.change(operation(2));
    socket.receive(9);
    f.change(operation(3));
    await vi.advanceTimersByTimeAsync(50);
    expect(socket.envelopes()).toEqual([
      { protocol: "gotipe.crdt/1", base, operations: [operation(2)] },
      { protocol: "gotipe.crdt/1", base, operations: [operation(3)] },
    ]);
  });

  it("offers only gotipe.v1 without a generation and still sends only pending operations", async () => {
    vi.useFakeTimers();
    const f = fixture({
      initialState: { baseline: base, updates: [envelope([operation(1, "bob")])] },
    });
    expect(new URL(f.urls[0]!).searchParams.has("generation")).toBe(false);
    expect(f.protocols[0]).toEqual(["gotipe.v1"]);
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope([operation(1, "bob")]));
    f.change(operation(2));
    expect(socket.envelopes()).toEqual([
      { protocol: "gotipe.crdt/1", base, operations: [operation(2)] },
    ]);
  });

  it("reports a transaction larger than a message instead of splitting it", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope());
    f.transaction(transaction(1, 250, 5000));
    await vi.advanceTimersByTimeAsync(1000);
    expect(socket.frames(3)).toEqual([]);
    expect(f.errors.map((error) => error.message)).toEqual([
      expect.stringContaining("larger than one message cannot be sent over gotipe.crdt/1"),
    ]);
  });

  it("reports a baseline too large to repeat instead of reconnecting forever", async () => {
    vi.useFakeTimers();
    const f = fixture({}, largeBase);
    const socket = f.sockets[0]!;
    socket.open();
    socket.receive(2, envelope([], largeBase));
    f.change(operation(1));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(socket.frames(3)).toEqual([]);
    expect(f.errors.map((error) => error.message)).toEqual([
      expect.stringContaining("too large for gotipe.crdt/1"),
    ]);
    expect(f.sockets).toHaveLength(1);
  });
});
