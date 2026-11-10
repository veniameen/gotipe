import type { GoTipeEditor } from "@gotipe/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { useEditor } from "./use-editor";

beforeEach(() => {
  vi.clearAllMocks();
  lifecycle.mount = null;
  lifecycle.cleanup = null;
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
