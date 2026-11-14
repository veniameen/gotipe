import { Worker as ThreadWorker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FindReplace, Paragraph, getFindReplace } from "../src/extensions";
import type { FindReplaceController, FindReplaceState } from "../src/extensions";
import type { GoTipeEditor } from "../src/types/editor";
import { ENGINES, createOn, doc, paragraph } from "./engines";

/** Patterns that run for seconds on 64 letters `a`: the search must time out, not block. */
const BACKTRACKING = [
  "(a+){8}x",
  "a*a*a*a*a*a*x",
  "(.+){5}!",
  "(a+){20}x",
  "(a|aa){25}x",
  "(.*a){12}x",
  "(a{1,30}){1,30}x",
  ".*.*.*.*.*.*x",
  "(?:a+){2,}x",
  "(a+)+x",
  "(\\w+\\s?)*x",
];

const blobs = new Map<string, Blob>();
const started: FakeWorker[] = [];

/** jsdom's `Blob` has no `text()`. */
function read(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });
}

/** A browser `Worker` backed by a Node thread, so a stuck pattern really runs elsewhere. */
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  private thread: ThreadWorker | null = null;
  private outbox: unknown[] = [];

  constructor(url: string) {
    started.push(this);
    void read(blobs.get(url)!).then((program) => {
      if (this.terminated) return;
      const thread = new ThreadWorker(
        `const { parentPort } = require("node:worker_threads");
globalThis.self = globalThis;
self.postMessage = (data) => parentPort.postMessage(data);
parentPort.on("message", (data) => self.onmessage({ data }));
${program}`,
        { eval: true },
      );
      thread.on("message", (data) => this.onmessage?.({ data }));
      thread.on("error", () => this.onerror?.({ preventDefault() {} }));
      this.thread = thread;
      for (const message of this.outbox.splice(0)) thread.postMessage(message);
    });
  }

  postMessage(message: unknown): void {
    if (this.thread) this.thread.postMessage(message);
    else this.outbox.push(message);
  }

  terminate(): void {
    this.terminated = true;
    void this.thread?.terminate();
  }
}

function until(
  search: FindReplaceController,
  done: (state: FindReplaceState) => boolean,
): Promise<FindReplaceState> {
  return new Promise((resolve) => {
    if (done(search.getState())) return resolve(search.getState());
    const stop = search.subscribe((state) => {
      if (!done(state)) return;
      stop();
      resolve(state);
    });
  });
}

const urls = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
const editors: GoTipeEditor[] = [];
beforeEach(() => {
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:test/${blobs.size}`;
    blobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = (url: string) => void blobs.delete(url);
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  for (const worker of started.splice(0)) worker.terminate();
  vi.unstubAllGlobals();
  URL.createObjectURL = urls.create;
  URL.revokeObjectURL = urls.revoke;
});

describe.each(ENGINES)("%s regex search in a Worker", (engine) => {
  async function setup(timeout = 200) {
    const editor = await createOn(engine, {
      extensions: [Paragraph, FindReplace.configure({ timeout })],
      content: doc(paragraph("a", "a".repeat(64)), paragraph("b", "кот и котёнок, cat 🐕 dog")),
    });
    editors.push(editor);
    return { editor, search: getFindReplace(editor)! };
  }

  it("finds with the page's matcher: whole words, Unicode letters, surrogate pairs", async () => {
    const { search } = await setup();
    expect(search.setSearch({ query: "кот|🐕", regex: true, wholeWord: true }).pending).toBe(true);
    const state = await until(search, (next) => !next.pending);
    expect(started).toHaveLength(1);
    expect(state).toMatchObject({ error: null, total: 2, position: 1 });
    expect(state.matches).toEqual([
      { blockId: "b", from: 0, to: 3 },
      { blockId: "b", from: 19, to: 21 },
    ]);
    search.setSearch({ query: "(cat|dog)+", wholeWord: false });
    expect((await until(search, (next) => !next.pending)).total).toBe(2);
  });

  it("stops each backtracking pattern at its time budget without blocking the page", async () => {
    const { search } = await setup(100);
    for (const query of BACKTRACKING) {
      const begin = performance.now();
      const state = search.setSearch({ query, regex: true });
      expect(performance.now() - begin, query).toBeLessThan(50);
      expect(state.pending, query).toBe(true);
      let ticks = 0;
      const timer = setInterval(() => ticks++, 5);
      const done = await until(search, (next) => !next.pending);
      clearInterval(timer);
      expect(done.error?.code, query).toBe("TIMEOUT");
      expect(ticks, query).toBeGreaterThan(5);
      expect(performance.now() - begin, query).toBeLessThan(1500);
    }
    // Every timed-out search ended its Worker; the next search started a new one.
    expect(started.filter((worker) => worker.terminated).length).toBeGreaterThanOrEqual(
      BACKTRACKING.length,
    );
    search.setSearch({ query: "(a?){25}a{25}" });
    expect((await until(search, (next) => !next.pending)).error?.code ?? "found").not.toBe(
      "UNSAFE_PATTERN",
    );
  });

  it("keeps the matches of unchanged blocks while the Worker searches the edited one", async () => {
    const { editor, search } = await setup();
    search.setSearch({ query: "cat|кот", regex: true });
    await until(search, (next) => !next.pending);
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "a", offset: 0, text: "cat ", marks: [] }],
    });
    const pending = search.getState();
    expect(pending.pending).toBe(true);
    expect(pending.matches.every((match) => match.blockId === "b")).toBe(true);
    const done = await until(search, (next) => !next.pending);
    expect(done.matches.map((match) => match.blockId)).toEqual(["a", "b", "b", "b"]);
    expect(done.matches[done.index]).toEqual({ blockId: "b", from: 0, to: 3 });
    // A replacement waits for the running search: the current match stays on its text.
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "b", offset: 0, text: "cot ", marks: [] }],
    });
    expect(search.getState().pending).toBe(true);
    expect(await search.replace("пёс")).toBe(true);
    const rest = "и котёнок, cat 🐕 dog";
    expect(editor.getText()).toBe(`cat ${"a".repeat(64)}\ncot пёс ${rest}`);
    expect(await search.replaceAll("X")).toBe(3);
    expect(editor.getText()).toBe(`X ${"a".repeat(64)}\ncot пёс и Xёнок, X 🐕 dog`);
  });

  it("falls back to the static check when the page refuses Workers", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new DOMException("Refused by the Content Security Policy", "SecurityError");
        }
      },
    );
    const { search } = await setup();
    expect(search.setSearch({ query: "(a+)+x", regex: true }).error?.code).toBe("UNSAFE_PATTERN");
    expect(search.setSearch({ query: "(cat|dog)+" })).toMatchObject({ total: 2, pending: false });
  });
});
