import { readFileSync } from "node:fs";
import { type Block, type GoTipeEditor, createEditorWithLoader } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { SuggestionsManager } from "../src/manager";

beforeAll(() => {
  wasm.initSync({
    module: readFileSync(new URL("../../wasm/pkg/gotipe_wasm_bg.wasm", import.meta.url)),
  });
});
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanup.splice(0)) stop();
  vi.useRealTimers();
});
const p = (id: string, text: string): Block => ({
  id,
  type: "paragraph",
  attrs: {},
  content: [{ text, marks: [] }],
  children: [],
});
const insert = (editor: GoTipeEditor, offset: number, text: string, blockId = "p") =>
  editor.dispatch({
    steps: [{ type: "insertText", blockId, offset, text, marks: [{ type: "bold", attrs: {} }] }],
    selection: { type: "cursor", blockId, offset: offset + text.length },
  });
describe.each(["js", "wasm"] as const)("%s tracked draft changes", (engine) => {
  async function setup(blocks = [p("p", "Hello world")]) {
    const editor = await createEditorWithLoader(
      { engine, extensions: FullPreset, content: { version: 1, blocks } },
      engine === "wasm" ? async () => wasm : null,
    );
    const manager = new SuggestionsManager(editor, {
      enabled: true,
      authorId: "a",
      authorName: "Alice",
    });
    cleanup.push(() => {
      manager.destroy();
      editor.destroy();
    });
    return { editor, manager };
  }
  it("coalesces continuous Unicode typing, keeps caret advancing, and rejects the exact inserted spans", async () => {
    const { editor, manager } = await setup();
    insert(editor, 5, " Ж");
    insert(editor, 7, "😀");
    expect(editor.getText()).toBe("Hello Ж😀 world");
    expect(editor.getViewState().selection.anchor.offset).toBe(9);
    expect(manager.getPendingSuggestions()).toHaveLength(1);
    const suggestion = manager.getPendingSuggestions()[0]!;
    expect(suggestion).toMatchObject({
      applied: true,
      type: "insert",
      newContent: " Ж😀",
      authorName: "Alice",
    });
    expect(editor.getDecorations().length).toBeGreaterThan(0);
    manager.rejectSuggestion(suggestion.id);
    expect(editor.getText()).toBe("Hello world");
    expect(editor.getDecorations()).toEqual([]);
    editor.undo();
    expect(editor.getText()).toBe("Hello Ж😀 world");
    expect(manager.getPendingSuggestions()).toHaveLength(1);
    editor.redo();
    expect(manager.getPendingSuggestions()).toHaveLength(0);
  });
  it("accepts a tracked edit without applying it twice and stops tracking on disable/destroy", async () => {
    const { editor, manager } = await setup();
    insert(editor, 5, "!");
    manager.acceptAll();
    expect(editor.getText()).toBe("Hello! world");
    expect(manager.getPendingSuggestions()).toEqual([]);
    manager.disable();
    insert(editor, 0, "x");
    expect(manager.getSuggestions()).toHaveLength(1);
    manager.destroy();
    insert(editor, 0, "y");
    expect(editor.getText()).toBe("yxHello! world");
  });
  it("restores deleted rich text and preserves a disjoint later edit", async () => {
    const { editor, manager } = await setup([
      {
        ...p("p", ""),
        content: [
          { text: "Hello ", marks: [] },
          { text: "world", marks: [{ type: "italic", attrs: {} }] },
        ],
      },
    ]);
    editor.dispatch({ steps: [{ type: "deleteText", blockId: "p", from: 6, to: 11 }] });
    const suggestion = manager.getPendingSuggestions()[0]!;
    manager.disable();
    insert(editor, 0, "Prefix ");
    manager.rejectSuggestion(suggestion.id);
    expect(editor.getText()).toBe("Prefix Hello world");
    expect(editor.getHTML()).toContain("<em>world</em>");
  });
  it("rejects a formatting edit and handles structural insertions without dropping unrelated blocks", async () => {
    const { editor, manager } = await setup([p("p", "Hello world"), p("tail", "tail")]);
    editor.dispatch({
      steps: [
        { type: "addMark", blockId: "p", from: 0, to: 5, mark: { type: "italic", attrs: {} } },
      ],
    });
    manager.rejectAll();
    expect(editor.getHTML()).not.toContain("<em>");
    editor.dispatch({
      steps: [{ type: "insertBlock", parentId: null, index: 1, block: p("new", "new") }],
    });
    const suggestion = manager.getPendingSuggestions()[0]!;
    expect(suggestion.type).toBe("structure");
    manager.disable();
    insert(editor, 0, "changed ", "p");
    manager.rejectSuggestion(suggestion.id);
    expect(editor.getJSON().blocks.map((block) => block.id)).toEqual(["p", "tail"]);
    expect(editor.getText()).toBe("changed Hello world\ntail");
  });
  it("does not capture cancelled transactions and leaves a stale rejection pending", async () => {
    const { editor, manager } = await setup();
    const stop = editor.addTransactionFilter(() => false);
    expect(insert(editor, 0, "no")).toBe(false);
    expect(manager.getSuggestions()).toEqual([]);
    stop();
    insert(editor, 5, "proposal");
    const id = manager.getPendingSuggestions()[0]!.id;
    manager.disable();
    editor.dispatch({ steps: [{ type: "deleteText", blockId: "p", from: 5, to: 8 }] });
    const content = editor.getJSON();
    expect(() => manager.rejectSuggestion(id)).toThrow();
    expect(editor.getJSON()).toEqual(content);
    expect(manager.getPendingSuggestions()).toHaveLength(1);
  });
  it("rejects all sequential edits in one transaction and one undo boundary", async () => {
    vi.useFakeTimers();
    const { editor, manager } = await setup();
    insert(editor, 5, "A");
    vi.advanceTimersByTime(1100);
    insert(editor, 6, "B");
    expect(manager.getPendingSuggestions()).toHaveLength(2);
    manager.rejectAll();
    expect(editor.getText()).toBe("Hello world");
    editor.undo();
    expect(editor.getText()).toBe("HelloAB world");
  });
  it("accepts adjacent edits separated by a pause without stale anchor errors", async () => {
    vi.useFakeTimers();
    const { editor, manager } = await setup();
    insert(editor, 5, "A");
    vi.advanceTimersByTime(1100);
    insert(editor, 6, "B");
    manager.acceptAll();
    expect(manager.getPendingSuggestions()).toEqual([]);
    expect(editor.getText()).toBe("HelloAB world");
  });
  it("round-trips complete inverse state and rejects malformed loads atomically", async () => {
    const { editor, manager } = await setup();
    insert(editor, 5, " Ж😀");
    const snapshot = JSON.parse(JSON.stringify(manager.exportState()));
    const reloaded = new SuggestionsManager(editor);
    cleanup.push(() => reloaded.destroy());
    reloaded.loadState(snapshot);
    const before = reloaded.exportState();
    expect(() =>
      reloaded.loadState({ version: 1, records: [snapshot.records[0], snapshot.records[0]] }),
    ).toThrow("Duplicate");
    expect(reloaded.exportState()).toEqual(before);
    expect(() =>
      reloaded.loadState({
        version: 1,
        records: [
          { suggestion: snapshot.records[0].suggestion, change: { before: {}, after: {} } },
        ],
      }),
    ).toThrow();
    expect(reloaded.exportState()).toEqual(before);
    manager.destroy();
    reloaded.rejectAll();
    expect(editor.getText()).toBe("Hello world");
    editor.undo();
    expect(editor.getText()).toBe("Hello Ж😀 world");
  });
});
