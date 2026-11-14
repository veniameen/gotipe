import { afterEach, describe, expect, it, vi } from "vitest";
import { FramePacer } from "../src/pacing";
import { type Socket, destroyProviders, envelope, fixture, operation, state } from "./fixture";

afterEach(() => {
  destroyProviders();
  vi.useRealTimers();
});

/** Cloud's default RATE_LIMIT_WS: messages per connection in any minute. */
const RATE_LIMIT = 1000;

/** The largest number of messages in any window of `span` ms. */
function busiest(times: number[], span: number): number {
  let most = 0;
  for (let end = 0, start = 0; end < times.length; end++) {
    while (times[end]! - times[start]! >= span) start++;
    most = Math.max(most, end - start + 1);
  }
  return most;
}
function record(socket: Socket, latency: number): number[] {
  const times: number[] = [];
  socket.onsend = (data) => {
    times.push(Date.now());
    if (data[0] === 3) setTimeout(() => socket.receive(9), latency);
  };
  return times;
}

describe("frame pacing", () => {
  it("sends at once after a pause and one frame per burst of typing", () => {
    const pacer = new FramePacer();
    expect(pacer.delay(1000)).toBe(0);
    pacer.spend(1000);
    expect(pacer.delay(1010)).toBe(40);
    expect(pacer.delay(1010, true)).toBe(0);
    expect(pacer.delay(1050)).toBe(0);
  });

  it("allows a burst and then a steady rate", () => {
    const pacer = new FramePacer(3, 2, 0);
    for (let sent = 0; sent < 3; sent++) {
      expect(pacer.delay(0)).toBe(0);
      pacer.spend(0);
    }
    expect(pacer.delay(0)).toBe(500);
    expect(pacer.delay(499)).toBe(1);
    expect(pacer.delay(500)).toBe(0);
    pacer.spend(500);
    expect(pacer.delay(500, true)).toBe(500);
  });

  it("keeps continuous fast typing with a moving caret under the message rate limit", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    const times = record(socket, 5);
    socket.receive(2, envelope());
    // Two minutes of key repeat: 30 characters a second, the caret moving with each.
    const keys = 2 * 60 * 30;
    for (let key = 1; key <= keys; key++) {
      f.change(operation(key));
      f.select({ blockId: "a", offset: key });
      await vi.advanceTimersByTimeAsync(1000 / 30);
    }
    await vi.advanceTimersByTimeAsync(5000);
    expect(busiest(times, 60_000)).toBeLessThan(RATE_LIMIT);
    // Nothing is dropped: every keystroke arrived, in order, in fewer frames.
    const sent = socket.updates().flatMap((update) => update.operations.map((op) => op.id.lamport));
    expect(sent).toEqual(Array.from({ length: keys }, (_, index) => index + 1));
    expect(socket.frames(3).length).toBeLessThan(keys / 4);
    expect(f.provider.getSyncState()).toEqual({ pendingOperations: 0, saving: false });
    expect(f.errors).toEqual([]);
  });

  it("merges a burst of typing into one frame and adds no delay after a pause", async () => {
    vi.useFakeTimers();
    const f = fixture({ initialState: state() });
    const socket = f.sockets[0]!;
    socket.open("gotipe.v2");
    record(socket, 1);
    socket.receive(2, envelope());
    f.change(operation(1));
    expect(socket.frames(3)).toHaveLength(1);
    for (let lamport = 2; lamport <= 6; lamport++) {
      await vi.advanceTimersByTimeAsync(5);
      f.change(operation(lamport));
    }
    expect(socket.frames(3)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(50);
    expect(socket.updates().map((update) => update.operations.length)).toEqual([1, 5]);
    await vi.advanceTimersByTimeAsync(500);
    f.change(operation(7));
    expect(socket.frames(3)).toHaveLength(3);
  });
});
