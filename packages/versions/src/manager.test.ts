import type { Block, Document } from "@gotipe/core";
import { createEditor } from "@gotipe/core/js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compareDocuments } from "./diff";
import { VersionsManager } from "./manager";

const block = (id: string, text: string): Block => ({
  id,
  type: "paragraph",
  attrs: {},
  content: [{ text, marks: [] }],
  children: [],
});
const initial: Document = { version: 1, blocks: [block("a", "first")] };
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanup.splice(0)) stop();
  vi.useRealTimers();
});
async function setup(options = {}) {
  const editor = await createEditor({ extensions: [], content: initial });
  const manager = new VersionsManager(editor, options);
  cleanup.push(() => {
    manager.destroy();
    editor.destroy();
  });
  return { editor, manager };
}

describe("version snapshots", () => {
  it("protects stored snapshots from mutation through all return paths", async () => {
    const { editor, manager } = await setup();
    const version = manager.createVersion("First", "user");
    version.snapshot.blocks.length = 0;
    manager.getVersions()[0]!.snapshot.blocks.length = 0;
    manager.getVersion(version.id)!.snapshot.blocks[0]!.attrs.changed = true;
    expect(manager.getVersion(version.id)!.snapshot).toEqual(initial);
    expect(editor.getText()).toBe("first");
  });
  it("restores a snapshot as one undoable edit and invokes callbacks after success", async () => {
    const restored = vi.fn();
    const { editor, manager } = await setup({ onVersionRestored: restored });
    const version = manager.createVersion("First", "user");
    editor.chain().insertText("new ").run();
    const before = editor.getText();
    expect(manager.restoreVersion(version.id)).toBe(true);
    expect(editor.getText()).toBe("first");
    expect(restored).toHaveBeenCalledOnce();
    editor.undo();
    expect(editor.getText()).toBe(before);
    expect(manager.restoreVersion("missing")).toBe(false);
  });
  it("compares nested edits, new descendants and moves without falsely modifying their parent", () => {
    const before: Document = {
      version: 1,
      blocks: [{ ...block("parent", "title"), children: [block("a", "one"), block("b", "two")] }],
    };
    const after = structuredClone(before);
    after.blocks[0]!.children = [block("b", "changed"), block("a", "one"), block("c", "three")];
    expect(compareDocuments(before, after)).toEqual({
      added: ["c"],
      removed: [],
      modified: ["b"],
      moved: ["b"],
    });
  });
  it("does not report siblings after an insertion or removal as moved (D-45)", () => {
    const before: Document = {
      version: 1,
      blocks: ["a", "b", "c", "d"].map((id) => block(id, id)),
    };
    const inserted: Document = {
      version: 1,
      blocks: ["a", "x", "b", "c", "d"].map((id) => block(id, id)),
    };
    expect(compareDocuments(before, inserted)).toEqual({
      added: ["x"],
      removed: [],
      modified: [],
      moved: [],
    });
    const removed: Document = { version: 1, blocks: ["b", "c", "d"].map((id) => block(id, id)) };
    expect(compareDocuments(before, removed).moved).toEqual([]);
    const swapped: Document = {
      version: 1,
      blocks: ["a", "c", "b", "d"].map((id) => block(id, id)),
    };
    expect(compareDocuments(before, swapped).moved).toHaveLength(1);
    const nested: Document = {
      version: 1,
      blocks: [
        { ...block("a", "a"), children: [block("b", "b")] },
        block("c", "c"),
        block("d", "d"),
      ],
    };
    expect(compareDocuments(before, nested).moved).toEqual(["b"]);
  });
  it("auto-saves only changes, enforces retention and stops when the editor is destroyed", async () => {
    vi.useFakeTimers();
    const { editor, manager } = await setup({
      autoSave: true,
      autoSaveInterval: 100,
      maxVersions: 2,
    });
    vi.advanceTimersByTime(500);
    expect(manager.getVersions()).toEqual([]);
    editor.chain().insertText("A").run();
    vi.advanceTimersByTime(100);
    expect(manager.getVersions()).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(manager.getVersions()).toHaveLength(1);
    editor.chain().insertText("B").run();
    vi.advanceTimersByTime(100);
    editor.chain().insertText("C").run();
    vi.advanceTimersByTime(100);
    expect(manager.getVersions()).toHaveLength(2);
    editor.destroy();
    vi.advanceTimersByTime(1000);
    expect(manager.getVersions()).toEqual([]);
    expect(() => manager.createVersion("Late", "user")).toThrow("destroyed");
  });
  it("notifies subscribers of real history changes and does not save after unsubscribe", async () => {
    const { manager } = await setup();
    const changed = vi.fn();
    const unsubscribe = manager.subscribe(changed);
    const version = manager.createVersion("First", "user");
    expect(manager.getRevision()).toBe(1);
    manager.deleteVersion(version.id);
    expect(changed).toHaveBeenCalledTimes(2);
    unsubscribe();
    manager.createVersion("Next", "user");
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
