import type { GoTipeEditor, ViewState } from "@gotipe/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@gotipe/core", () => ({ createEditor: vi.fn() }));
import { createEditor } from "@gotipe/core";
import { createEditorState } from "./create-editor-state";

/** The store only creates an editor where the DOM exists. */
function inBrowser(): void {
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", {});
}

function onServer(): void {
  vi.stubGlobal("window", undefined);
  vi.stubGlobal("document", undefined);
}

beforeEach(() => {
  vi.resetAllMocks();
  inBrowser();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fakeEditor() {
  const unsubscribe = vi.fn();
  const instance = {
    destroy: vi.fn(),
    getViewState: () => ({ blocks: [] }) as unknown as ViewState,
    on: vi.fn(() => unsubscribe),
  } as unknown as GoTipeEditor;
  return { instance, unsubscribe };
}

/** Node's process of the test runner; the package does not depend on Node's types. */
declare const process: {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  off(event: "unhandledRejection", listener: (reason: unknown) => void): void;
};

/** Runs `body` and lets Node report the rejections nobody handled during it. */
async function unhandledRejections(body: () => Promise<void>): Promise<unknown[]> {
  const reasons: unknown[] = [];
  const listener = (reason: unknown) => reasons.push(reason);
  process.on("unhandledRejection", listener);
  try {
    await body();
    await new Promise((done) => setTimeout(done, 0));
  } finally {
    process.off("unhandledRejection", listener);
  }
  return reasons;
}

describe("editor store lifecycle", () => {
  it("does not revive a destroyed store after initialization resolves", async () => {
    let resolve!: (editor: GoTipeEditor) => void;
    vi.mocked(createEditor).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { instance } = fakeEditor();
    const store = createEditorState({ extensions: [] });
    const subscriber = vi.fn();
    store.subscribe(subscriber);
    store.destroy();
    resolve(instance);
    await Promise.resolve();
    expect(store.editor).toBeNull();
    expect(store.state).toBeUndefined();
    expect(instance.destroy).toHaveBeenCalledTimes(1);
    expect(instance.on).not.toHaveBeenCalled();
    expect(subscriber.mock.calls.every(([value]) => value.editor === null)).toBe(true);
  });

  it("notifies subscribers of teardown and destroys exactly once", async () => {
    const { instance, unsubscribe } = fakeEditor();
    vi.mocked(createEditor).mockResolvedValue(instance);
    const store = createEditorState({ extensions: [] });
    const subscriber = vi.fn();
    store.subscribe(subscriber);
    await Promise.resolve();
    expect(store.editor).toBe(instance);
    expect(store.error).toBeNull();
    store.destroy();
    store.destroy();
    expect(subscriber).toHaveBeenLastCalledWith({ editor: null, state: undefined, error: null });
    expect(instance.destroy).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("stops notifications after a subscriber unsubscribes", async () => {
    const { instance } = fakeEditor();
    vi.mocked(createEditor).mockResolvedValue(instance);
    const store = createEditorState({ extensions: [] });
    const subscriber = vi.fn();
    const unsubscribe = store.subscribe(subscriber);
    unsubscribe();
    await Promise.resolve();
    store.destroy();
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  it("passes the editor options without its own onError", () => {
    vi.mocked(createEditor).mockReturnValue(new Promise(() => {}));
    const onError = vi.fn();
    createEditorState({ extensions: [], content: "<p>a</p>", onError });
    expect(createEditor).toHaveBeenCalledWith({ extensions: [], content: "<p>a</p>" });
  });
});

describe("creation errors", () => {
  it("reports a failed creation through onError and error, not as an unhandled rejection", async () => {
    const failure = new Error("WASM failed");
    vi.mocked(createEditor).mockImplementation(() => Promise.reject(failure));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const subscriber = vi.fn();
    let store!: ReturnType<typeof createEditorState>;
    const unhandled = await unhandledRejections(async () => {
      store = createEditorState({ extensions: [], onError });
      store.subscribe(subscriber);
    });
    expect(unhandled).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(store.error).toBe(failure);
    expect(store.editor).toBeNull();
    expect(subscriber).toHaveBeenLastCalledWith({ editor: null, state: undefined, error: failure });
    expect(logged).not.toHaveBeenCalled();
  });

  it("logs a failed creation that has no onError and keeps the error for later subscribers", async () => {
    const failure = new Error("schema");
    vi.mocked(createEditor).mockImplementation(() => Promise.reject(failure));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    let store!: ReturnType<typeof createEditorState>;
    const unhandled = await unhandledRejections(async () => {
      store = createEditorState({ extensions: [] });
    });
    expect(unhandled).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("GoTipe: Failed to create editor:", failure);
    const subscriber = vi.fn();
    store.subscribe(subscriber);
    expect(subscriber).toHaveBeenCalledWith({ editor: null, state: undefined, error: failure });
  });

  it("turns a rejection that is not an Error into one and keeps the reason as its cause", async () => {
    vi.mocked(createEditor).mockImplementation(() => Promise.reject("no engine"));
    const onError = vi.fn();
    let store!: ReturnType<typeof createEditorState>;
    const unhandled = await unhandledRejections(async () => {
      store = createEditorState({ extensions: [], onError });
    });
    expect(unhandled).toEqual([]);
    expect(store.error).toBeInstanceOf(Error);
    expect(store.error?.message).toBe("no engine");
    expect(store.error?.cause).toBe("no engine");
    expect(onError).toHaveBeenCalledWith(store.error);
  });

  it("stays silent about a creation that fails after destroy", async () => {
    let reject!: (reason: unknown) => void;
    vi.mocked(createEditor).mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const subscriber = vi.fn();
    const unhandled = await unhandledRejections(async () => {
      const store = createEditorState({ extensions: [], onError });
      store.subscribe(subscriber);
      store.destroy();
      reject(new Error("late"));
      await Promise.resolve();
      expect(store.error).toBeNull();
    });
    expect(unhandled).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
    expect(subscriber.mock.calls.every(([value]) => value.error === null)).toBe(true);
  });
});

describe("server rendering", () => {
  it("creates no editor without a DOM and stays empty", async () => {
    onServer();
    const onError = vi.fn();
    const subscriber = vi.fn();
    const unhandled = await unhandledRejections(async () => {
      const store = createEditorState({ extensions: [], onError });
      store.subscribe(subscriber);
      expect(store.editor).toBeNull();
      expect(store.state).toBeUndefined();
      expect(store.error).toBeNull();
      store.destroy();
    });
    expect(createEditor).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
    expect(subscriber).toHaveBeenCalledWith({ editor: null, state: undefined, error: null });
  });
});
