import type { GoTipeEditor } from "@gotipe/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lifecycle = vi.hoisted(() => ({
  mount: null as null | (() => Promise<void>),
  cleanup: null as null | (() => void),
}));
vi.mock("vue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue")>()),
  onMounted: (fn: () => Promise<void>) => {
    lifecycle.mount = fn;
  },
  onBeforeUnmount: (fn: () => void) => {
    lifecycle.cleanup = fn;
  },
}));
vi.mock("@gotipe/core", () => ({ createEditor: vi.fn() }));
import { createEditor } from "@gotipe/core";
import { useEditor, useEditorStatus } from "./use-editor";

beforeEach(() => {
  vi.resetAllMocks();
  lifecycle.mount = null;
  lifecycle.cleanup = null;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("editor lifecycle", () => {
  it("destroys a late editor when the component unmounts during initialization", async () => {
    let resolve!: (editor: GoTipeEditor) => void;
    vi.mocked(createEditor).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const instance = { destroy: vi.fn() } as unknown as GoTipeEditor;
    const editor = useEditor({ extensions: [] });
    const mounted = lifecycle.mount!();
    lifecycle.cleanup!();
    resolve(instance);
    await mounted;
    expect(editor.value).toBeNull();
    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });

  it("exposes the initialized editor and releases it on unmount", async () => {
    const instance = { destroy: vi.fn() } as unknown as GoTipeEditor;
    vi.mocked(createEditor).mockResolvedValue(instance);
    const editor = useEditor({ extensions: [] });
    await lifecycle.mount!();
    expect(editor.value).toBe(instance);
    lifecycle.cleanup!();
    expect(editor.value).toBeNull();
    expect(instance.destroy).toHaveBeenCalledTimes(1);
  });
});

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

describe("creation errors", () => {
  it("reports a failed creation through onError and error, not as an unhandled rejection", async () => {
    const failure = new Error("WASM failed");
    vi.mocked(createEditor).mockImplementation(() => Promise.reject(failure));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const status = useEditorStatus({ extensions: [], content: "<p>a</p>", onError });
    const unhandled = await unhandledRejections(async () => {
      await lifecycle.mount!();
    });
    expect(unhandled).toEqual([]);
    expect(createEditor).toHaveBeenCalledWith({ extensions: [], content: "<p>a</p>" });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(status.error.value).toBe(failure);
    expect(status.editor.value).toBeNull();
    expect(logged).not.toHaveBeenCalled();
  });

  it("logs a failed creation that has no onError", async () => {
    const failure = new Error("schema");
    vi.mocked(createEditor).mockImplementation(() => Promise.reject(failure));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const status = useEditorStatus({ extensions: [] });
    const unhandled = await unhandledRejections(async () => {
      await lifecycle.mount!();
    });
    expect(unhandled).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("GoTipe: Failed to create editor:", failure);
    expect(status.error.value).toBe(failure);
  });

  it("turns a rejection that is not an Error into one and keeps the reason as its cause", async () => {
    vi.mocked(createEditor).mockImplementation(() => Promise.reject("no engine"));
    const onError = vi.fn();
    const status = useEditorStatus({ extensions: [], onError });
    const unhandled = await unhandledRejections(async () => {
      await lifecycle.mount!();
    });
    expect(unhandled).toEqual([]);
    const error = status.error.value;
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe("no engine");
    expect(error?.cause).toBe("no engine");
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("stays silent about a creation that fails after unmount", async () => {
    let reject!: (reason: unknown) => void;
    vi.mocked(createEditor).mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const status = useEditorStatus({ extensions: [], onError });
    const unhandled = await unhandledRejections(async () => {
      const mounted = lifecycle.mount!();
      lifecycle.cleanup!();
      reject(new Error("late"));
      await mounted;
    });
    expect(unhandled).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
    expect(status.error.value).toBeNull();
  });

  it("keeps useEditor the editor of useEditorStatus", async () => {
    const instance = { destroy: vi.fn() } as unknown as GoTipeEditor;
    vi.mocked(createEditor).mockResolvedValue(instance);
    const status = useEditorStatus({ extensions: [] });
    await lifecycle.mount!();
    expect(status.editor.value).toBe(instance);
    expect(status.error.value).toBeNull();
  });
});
