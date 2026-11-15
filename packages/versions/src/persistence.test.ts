import type { Block, Document } from "@gotipe/core";
import { createEditor } from "@gotipe/core/js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VersionsManager } from "./manager";
import type { Version, VersionsOptions } from "./types";

const block = (id: string, text: string): Block => ({
  id,
  type: "paragraph",
  attrs: {},
  content: [{ text, marks: [] }],
  children: [],
});
const page = (text: string): Document => ({ version: 1, blocks: [block("a", text)] });
const stored = (id: string, createdAt: string, text: string): Version => ({
  id,
  name: `Version ${id}`,
  createdAt,
  createdBy: "user",
  snapshot: page(text),
});
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanup.splice(0)) stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function setup(options: VersionsOptions = {}, content = page("first")) {
  const editor = await createEditor({ extensions: [], content });
  cleanup.push(() => editor.destroy());
  const manager = new VersionsManager(editor, options);
  cleanup.push(() => manager.destroy());
  return { editor, manager };
}

describe("stored versions (D-44)", () => {
  it("loads an exported state back as detached versions that restore", async () => {
    const { editor, manager } = await setup();
    manager.createVersion("First", "Alice", "Draft");
    editor.chain().insertText("new ").run();
    manager.createVersion("Second", "Bob");
    const saved = JSON.parse(JSON.stringify(manager.exportState()));
    expect(saved.version).toBe(1);

    const { editor: other, manager: loaded } = await setup({}, page("other"));
    const changed = vi.fn();
    loaded.subscribe(changed);
    loaded.loadState(saved);
    expect(changed).toHaveBeenCalledOnce();
    expect(loaded.getRevision()).toBe(1);
    expect(loaded.getVersions()).toEqual(manager.getVersions());
    saved.versions[0].snapshot.blocks.length = 0;
    loaded.exportState().versions[0]!.snapshot.blocks.length = 0;
    const first = loaded.getVersions()[0]!;
    expect(first.snapshot).toEqual(page("first"));
    expect(loaded.restoreVersion(first.id)).toBe(true);
    expect(other.getText()).toBe("first");
  });
  it("starts with initialState and keeps the newest maxVersions, oldest first", async () => {
    const { manager } = await setup({
      maxVersions: 2,
      initialState: {
        version: 1,
        versions: [
          stored("c", "2026-11-15T12:00:00Z", "three"),
          stored("a", "2026-11-15T10:00:00Z", "one"),
          stored("b", "2026-11-15T11:00:00.000+01:00", "two"),
          stored("d", "2026-11-15T12:00:00.000Z", "four"),
        ],
      },
    });
    // b is 10:00Z: equal times keep their stored order, the oldest are dropped.
    expect(manager.getVersions().map((version) => version.id)).toEqual(["c", "d"]);
  });
  it.each([
    ["no snapshot", null],
    ["another format", { version: 2, versions: [] }],
    ["no list", { version: 1 }],
    [
      "a duplicate ID",
      { version: 1, versions: [stored("a", "2026-01-01", "x"), stored("a", "2026-01-02", "y")] },
    ],
    ["an empty name", { version: 1, versions: [{ ...stored("a", "2026-01-01", "x"), name: " " }] }],
    ["a bad date", { version: 1, versions: [stored("a", "yesterday", "x")] }],
    [
      "a missing author",
      { version: 1, versions: [{ ...stored("a", "2026-01-01", "x"), createdBy: undefined }] },
    ],
    [
      "a bad description",
      { version: 1, versions: [{ ...stored("a", "2026-01-01", "x"), description: 1 }] },
    ],
    [
      "a broken document",
      {
        version: 1,
        versions: [
          {
            ...stored("a", "2026-01-01", "x"),
            snapshot: { blocks: [block("a", "1"), block("a", "2")] },
          },
        ],
      },
    ],
  ])("rejects %s and keeps the versions it had", async (_name, snapshot) => {
    const { manager } = await setup();
    const kept = manager.createVersion("Kept", "user");
    const revision = manager.getRevision();
    expect(() => manager.loadState(snapshot)).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
    expect(manager.getVersions()).toEqual([kept]);
    expect(manager.getRevision()).toBe(revision);
  });
  it("fails to start with an invalid initialState and starts no auto-save", async () => {
    const editor = await createEditor({ extensions: [], content: page("first") });
    cleanup.push(() => editor.destroy());
    const interval = vi.spyOn(globalThis, "setInterval");
    expect(() => new VersionsManager(editor, { autoSave: true, initialState: {} })).toThrow(
      "Unsupported versions snapshot",
    );
    expect(interval).not.toHaveBeenCalled();
  });
  it("auto-saves against the newest loaded version", async () => {
    vi.useFakeTimers();
    const saved = { version: 1, versions: [stored("a", "2026-11-15T10:00:00Z", "first")] };
    const { manager } = await setup({ autoSave: true, autoSaveInterval: 100, initialState: saved });
    vi.advanceTimersByTime(300);
    expect(manager.getVersions()).toHaveLength(1);
    const { manager: behind } = await setup(
      { autoSave: true, autoSaveInterval: 100, initialState: saved },
      page("edited after the last version"),
    );
    vi.advanceTimersByTime(100);
    expect(behind.getVersions().map((version) => version.createdBy)).toEqual(["user", "system"]);
  });
  it("refuses state calls after destroy", async () => {
    const { manager } = await setup();
    manager.destroy();
    expect(() => manager.exportState()).toThrow("destroyed");
    expect(() => manager.loadState({ version: 1, versions: [] })).toThrow("destroyed");
  });
});
