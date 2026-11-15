import { createEditor } from "@gotipe/core/js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SuggestionsManager } from "./manager";
import type { Suggestion, SuggestionState } from "./types";

/** The platform crypto, kept before a test stubs the global. */
const platform = globalThis.crypto;

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanup.splice(0)) stop();
  vi.unstubAllGlobals();
});
async function setup(text = "Hello world") {
  const editor = await createEditor({
    extensions: [],
    content: {
      version: 1,
      blocks: [
        { id: "p", type: "paragraph", attrs: {}, content: [{ text, marks: [] }], children: [] },
      ],
    },
  });
  const manager = new SuggestionsManager(editor);
  cleanup.push(() => {
    manager.destroy();
    editor.destroy();
  });
  const add = (options: Partial<Suggestion> = {}) =>
    manager.addSuggestion({
      type: "replace",
      blockId: "p",
      from: 6,
      to: 11,
      newContent: "friend",
      authorId: "a",
      authorName: "A",
      ...options,
    });
  return { editor, manager, add };
}
describe("suggestion acceptance integrity", () => {
  it("applies replacement once and records one editor undo item", async () => {
    const { editor, manager, add } = await setup();
    const proposal = add();
    manager.acceptSuggestion(proposal.id);
    expect(editor.getText()).toBe("Hello friend");
    expect(manager.getSuggestions()[0]!.status).toBe("accepted");
    manager.acceptSuggestion(proposal.id);
    expect(editor.getText()).toBe("Hello friend");
    editor.undo();
    expect(editor.getText()).toBe("Hello world");
    expect(editor.undo()).toBe(false);
  });
  it("applies explicit formatting and rejects a format proposal without marks", async () => {
    const { editor, manager, add } = await setup();
    expect(() => add({ type: "format", newContent: undefined })).toThrow("explicit marks");
    const proposal = add({ type: "format", format: { add: [{ type: "bold", attrs: {} }] } });
    manager.acceptSuggestion(proposal.id);
    expect(editor.getHTML()).toContain("<strong>world</strong>");
  });
  it("resolves a shifted anchor and rejects an edited source without applying stale offsets", async () => {
    const { editor, manager, add } = await setup();
    const proposal = add();
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "p", offset: 0, text: "Prefix ", marks: [] }],
    });
    manager.acceptSuggestion(proposal.id);
    expect(editor.getText()).toBe("Prefix Hello friend");
    const stale = add({ from: 13, to: 19 });
    editor.dispatch({ steps: [{ type: "deleteText", blockId: "p", from: 13, to: 14 }] });
    const before = editor.getText();
    expect(() => manager.acceptSuggestion(stale.id)).toThrow("anchor");
    expect(editor.getText()).toBe(before);
    expect(manager.getPendingSuggestions()[0]!.id).toBe(stale.id);
  });
  it("accepts disjoint ranges atomically with original offsets", async () => {
    const { editor, manager, add } = await setup("alpha beta gamma");
    add({ from: 0, to: 5, newContent: "A" });
    add({ from: 11, to: 16, newContent: "G" });
    manager.acceptAll();
    expect(editor.getText()).toBe("A beta G");
    expect(manager.getPendingSuggestions()).toEqual([]);
    editor.undo();
    expect(editor.getText()).toBe("alpha beta gamma");
    expect(editor.undo()).toBe(false);
  });
  it("rejects overlapping acceptAll without partial status or document changes", async () => {
    const { editor, manager, add } = await setup();
    add();
    add({ from: 7, to: 10, newContent: "X" });
    expect(() => manager.acceptAll()).toThrow("overlap");
    expect(editor.getText()).toBe("Hello world");
    expect(manager.getPendingSuggestions()).toHaveLength(2);
  });
  it("leaves a rejected transaction pending and protects state from returned snapshots", async () => {
    const { editor, manager, add } = await setup();
    const proposal = add();
    proposal.status = "accepted";
    const dispatch = vi.spyOn(editor, "dispatch").mockImplementationOnce(() => {
      throw new Error("engine rejected");
    });
    expect(() => manager.acceptSuggestion(proposal.id)).toThrow("engine rejected");
    expect(manager.getPendingSuggestions()).toHaveLength(1);
    expect(editor.getText()).toBe("Hello world");
    dispatch.mockRestore();
    manager.rejectSuggestion(proposal.id);
    manager.acceptSuggestion(proposal.id);
    expect(editor.getText()).toBe("Hello world");
    manager.destroy();
    expect(() => add()).toThrow("destroyed");
  });
});

describe("a page served over plain HTTP (D-85)", () => {
  it("creates a manager, proposals and tracked changes without crypto.randomUUID", async () => {
    const { editor } = await setup();
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => platform.getRandomValues(array),
    });
    const manager = new SuggestionsManager(editor);
    cleanup.push(() => manager.destroy());
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const proposal = manager.addSuggestion({
      type: "replace",
      blockId: "p",
      from: 0,
      to: 5,
      newContent: "Hi",
      authorId: "a",
      authorName: "A",
    });
    expect(proposal.id).toMatch(uuid);
    manager.enable();
    const end = { blockId: "p", offset: 11 };
    editor.setSelection({ anchor: end, head: end });
    expect(editor.chain().insertText("!").run()).toBe(true);
    const tracked = manager.getSuggestions().filter((item) => item.id !== proposal.id);
    expect(tracked).toHaveLength(1);
    expect(tracked[0]!.id).toMatch(uuid);
  });
});

describe("SuggestionState (D-47)", () => {
  it("is what getState() returns: tracking or off, never the unused viewing", async () => {
    const editor = await createEditor({ extensions: [] });
    const manager = new SuggestionsManager(editor, {});
    const seen: SuggestionState[] = [manager.getState()];
    manager.enable();
    seen.push(manager.getState());
    manager.destroy();
    editor.destroy();
    expect(seen).toEqual(["off", "tracking"]);
    // @ts-expect-error "viewing" was declared but never reached; typecheck fails if it returns
    const viewing: SuggestionState = "viewing";
    expect(viewing).toBe("viewing");
  });
});
