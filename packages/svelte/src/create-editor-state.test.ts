import type { GoTipeEditor, ViewState } from "@gotipe/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@gotipe/core", () => ({ createEditor: vi.fn() }));
import { createEditor } from "@gotipe/core";
import { createEditorState } from "./create-editor-state";

beforeEach(() => vi.clearAllMocks());

function fakeEditor() {
  const unsubscribe = vi.fn();
  const instance = {
    destroy: vi.fn(),
    getViewState: () => ({ blocks: [] }) as unknown as ViewState,
    on: vi.fn(() => unsubscribe),
  } as unknown as GoTipeEditor;
  return { instance, unsubscribe };
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
    store.destroy();
    store.destroy();
    expect(subscriber).toHaveBeenLastCalledWith({ editor: null, state: undefined });
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
});
