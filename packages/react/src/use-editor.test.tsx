// @vitest-environment jsdom
import type { GoTipeEditor } from "@gotipe/core";
import { Activity, StrictMode, act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@gotipe/core", () => ({ createEditor: vi.fn() }));
import { createEditor } from "@gotipe/core";
import { type EditorStatus, type UseEditorOptions, useEditor, useEditorStatus } from "./use-editor";

/** Node's process of the test runner; the package does not depend on Node's types. */
declare const process: {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  off(event: "unhandledRejection", listener: (reason: unknown) => void): void;
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

/** Lets pending promises settle and React apply what they set. */
const settle = () => act(() => new Promise<void>((done) => setTimeout(done, 0)));

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function StatusProbe({ options, seen }: { options: UseEditorOptions; seen: EditorStatus[] }) {
  seen.push(useEditorStatus(options));
  return null;
}

function EditorProbe({
  options,
  seen,
}: { options: UseEditorOptions; seen: (GoTipeEditor | null)[] }) {
  seen.push(useEditor(options));
  return null;
}

describe("useEditorStatus", () => {
  it("reports a failed creation through onError and error, without logging it", async () => {
    const failure = new Error("WASM failed");
    vi.mocked(createEditor).mockImplementation(() => Promise.reject(failure));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const seen: EditorStatus[] = [];
    const unhandled = await unhandledRejections(async () => {
      await act(async () =>
        root.render(<StatusProbe options={{ extensions: [], onError }} seen={seen} />),
      );
      await settle();
    });
    expect(unhandled).toEqual([]);
    expect(seen[0]).toEqual({ editor: null, error: null });
    expect(seen.at(-1)).toEqual({ editor: null, error: failure });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(logged).not.toHaveBeenCalled();
  });

  it("logs a failed creation that has no onError", async () => {
    const failure = new Error("schema");
    vi.mocked(createEditor).mockImplementation(() => Promise.reject(failure));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: EditorStatus[] = [];
    const unhandled = await unhandledRejections(async () => {
      await act(async () => root.render(<StatusProbe options={{ extensions: [] }} seen={seen} />));
      await settle();
    });
    expect(unhandled).toEqual([]);
    expect(seen.at(-1)).toEqual({ editor: null, error: failure });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("GoTipe: Failed to create editor:", failure);
  });

  it("turns a rejection that is not an Error into one and keeps the reason as its cause", async () => {
    vi.mocked(createEditor).mockImplementation(() => Promise.reject("no engine"));
    const onError = vi.fn();
    const seen: EditorStatus[] = [];
    const unhandled = await unhandledRejections(async () => {
      await act(async () =>
        root.render(<StatusProbe options={{ extensions: [], onError }} seen={seen} />),
      );
      await settle();
    });
    expect(unhandled).toEqual([]);
    const error = seen.at(-1)?.error;
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe("no engine");
    expect(error?.cause).toBe("no engine");
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("gives the created editor with no error and destroys it on unmount", async () => {
    const instance = { destroy: vi.fn() } as unknown as GoTipeEditor;
    vi.mocked(createEditor).mockResolvedValue(instance);
    const seen: EditorStatus[] = [];
    await act(async () => root.render(<StatusProbe options={{ extensions: [] }} seen={seen} />));
    await settle();
    expect(seen.at(-1)).toEqual({ editor: instance, error: null });
    act(() => root.unmount());
    expect(instance.destroy).toHaveBeenCalledTimes(1);
    root = createRoot(container);
  });

  it("stays silent about a creation that fails after unmount", async () => {
    const creation = deferred<GoTipeEditor>();
    vi.mocked(createEditor).mockReturnValue(creation.promise);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const seen: EditorStatus[] = [];
    const unhandled = await unhandledRejections(async () => {
      await act(async () =>
        root.render(<StatusProbe options={{ extensions: [], onError }} seen={seen} />),
      );
      act(() => root.unmount());
      creation.reject(new Error("late"));
      await settle();
    });
    root = createRoot(container);
    expect(unhandled).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
    expect(seen.every((status) => status.error === null)).toBe(true);
  });

  it("reports one failure under StrictMode, which creates the editor twice", async () => {
    vi.mocked(createEditor).mockImplementation(() => Promise.reject(new Error("WASM failed")));
    const onError = vi.fn();
    const seen: EditorStatus[] = [];
    const unhandled = await unhandledRejections(async () => {
      await act(async () =>
        root.render(
          <StrictMode>
            <StatusProbe options={{ extensions: [], onError }} seen={seen} />
          </StrictMode>,
        ),
      );
      await settle();
    });
    expect(unhandled).toEqual([]);
    expect(createEditor).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)?.error).toBe(onError.mock.calls[0]?.[0]);
  });

  it("clears the previous error when the editor is created again with new options", async () => {
    const failure = new Error("bad content");
    const instance = { destroy: vi.fn() } as unknown as GoTipeEditor;
    const second = deferred<GoTipeEditor>();
    vi.mocked(createEditor).mockImplementationOnce(() => Promise.reject(failure));
    vi.mocked(createEditor).mockReturnValueOnce(second.promise);
    const onError = vi.fn();
    const seen: EditorStatus[] = [];
    const render = (mode: "visible" | "hidden", content: string) =>
      root.render(
        <Activity mode={mode}>
          <StatusProbe options={{ extensions: [], content, onError }} seen={seen} />
        </Activity>,
      );
    await act(async () => render("visible", "a"));
    await settle();
    expect(seen.at(-1)).toEqual({ editor: null, error: failure });

    // Hidden, the effects are cleaned up; shown again, they create the editor anew.
    await act(async () => render("hidden", "a"));
    await act(async () => render("visible", "b"));
    expect(createEditor).toHaveBeenCalledTimes(2);
    expect(createEditor).toHaveBeenLastCalledWith({ extensions: [], content: "b" });
    expect(seen.at(-1)).toEqual({ editor: null, error: null });

    second.resolve(instance);
    await settle();
    expect(seen.at(-1)).toEqual({ editor: instance, error: null });
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("useEditor", () => {
  it("still returns the editor alone", async () => {
    const instance = { destroy: vi.fn() } as unknown as GoTipeEditor;
    vi.mocked(createEditor).mockResolvedValue(instance);
    const seen: (GoTipeEditor | null)[] = [];
    await act(async () => root.render(<EditorProbe options={{ extensions: [] }} seen={seen} />));
    await settle();
    expect(seen[0]).toBeNull();
    expect(seen.at(-1)).toBe(instance);
  });

  it("passes a failed creation to onError and stays null", async () => {
    const failure = new Error("WASM failed");
    vi.mocked(createEditor).mockImplementation(() => Promise.reject(failure));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const seen: (GoTipeEditor | null)[] = [];
    const unhandled = await unhandledRejections(async () => {
      await act(async () =>
        root.render(<EditorProbe options={{ extensions: [], onError }} seen={seen} />),
      );
      await settle();
    });
    expect(unhandled).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(seen.every((editor) => editor === null)).toBe(true);
    expect(logged).not.toHaveBeenCalled();
  });

  it("passes the editor options without its own onError", async () => {
    vi.mocked(createEditor).mockReturnValue(new Promise(() => {}));
    const onError = vi.fn();
    const seen: (GoTipeEditor | null)[] = [];
    await act(async () =>
      root.render(
        <EditorProbe options={{ extensions: [], content: "<p>a</p>", onError }} seen={seen} />,
      ),
    );
    expect(createEditor).toHaveBeenCalledWith({ extensions: [], content: "<p>a</p>" });
  });
});
