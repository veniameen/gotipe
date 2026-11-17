import { createEditor } from "@gotipe/core/js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommentsManager } from "./manager";

/** The platform crypto, kept before a test stubs the global. */
const platform = globalThis.crypto;

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanup.splice(0)) stop();
  vi.unstubAllGlobals();
});
async function setup(options = {}) {
  const editor = await createEditor({
    extensions: [],
    content: {
      version: 1,
      blocks: ["Hello world", "Second paragraph"].map((text, index) => ({
        id: index ? "b" : "a",
        type: "paragraph",
        attrs: {},
        content: [{ text, marks: [] }],
        children: [],
      })),
    },
  });
  const manager = new CommentsManager(editor, options);
  cleanup.push(() => {
    manager.destroy();
    editor.destroy();
  });
  const add = () =>
    manager.addComment({
      blockId: "a",
      from: 6,
      to: 11,
      authorId: "alice",
      authorName: "Alice",
      content: "Review this phrase",
    });
  return { editor, manager, add };
}
describe("owned comment lifecycle", () => {
  it("creates replies, edits, resolves, reopens and deletes with immutable host snapshots", async () => {
    const onChange = vi.fn();
    const onAdd = vi.fn();
    const onReply = vi.fn();
    const { editor, manager, add } = await setup({ onChange, onAdd, onReply });
    const before = editor.getJSON();
    const comment = add();
    expect(comment.quotedText).toBe("world");
    comment.content = "mutated";
    expect(manager.getComment(comment.id)!.content).toBe("Review this phrase");
    const reply = manager.addReply(comment.id, {
      authorId: "bob",
      authorName: "Bob",
      content: "Added details",
    })!;
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onReply).toHaveBeenCalledTimes(1);
    manager.updateReply(comment.id, reply.id, "Updated details");
    manager.updateComment(comment.id, "Revised question");
    manager.resolveComment(comment.id, "bob");
    expect(manager.getUnresolvedComments()).toEqual([]);
    manager.unresolveComment(comment.id);
    expect(manager.getUnresolvedComments()).toHaveLength(1);
    expect(manager.getComment(comment.id)!.resolvedAt).toBeUndefined();
    manager.deleteReply(comment.id, reply.id);
    expect(manager.getComment(comment.id)!.replies).toEqual([]);
    manager.deleteComment(comment.id);
    expect(manager.getComments()).toEqual([]);
    expect(editor.getDecorations()).toEqual([]);
    expect(editor.getJSON()).toEqual(before);
    expect(onChange).toHaveBeenCalled();
  });
  it("anchors a cross-block quote, rebases prefix insertion, and restores after document undo", async () => {
    const { editor, manager } = await setup();
    const comment = manager.addComment({
      blockId: "a",
      from: 6,
      endBlockId: "b",
      to: 6,
      authorId: "alice",
      authorName: "Alice",
      content: "Both paragraphs",
    });
    expect(comment.quotedText).toBe("world\nSecond");
    expect(editor.getDecorations()).toHaveLength(2);
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "a", offset: 0, text: "😀 ", marks: [] }],
    });
    expect(manager.getComment(comment.id)).toMatchObject({
      from: 9,
      to: 6,
      endBlockId: "b",
      orphaned: false,
    });
    editor.dispatch({ steps: [{ type: "deleteText", blockId: "a", from: 9, to: 14 }] });
    expect(manager.getComment(comment.id)!.orphaned).toBe(true);
    expect(editor.getDecorations()).toEqual([]);
    editor.undo();
    expect(manager.getComment(comment.id)!.orphaned).toBe(false);
    expect(editor.getDecorations()).toHaveLength(2);
  });
  it("round-trips persistence, validates all imports before replacement, and marks missing quotes orphaned", async () => {
    const { editor, manager, add } = await setup();
    const comment = add();
    manager.addReply(comment.id, { authorId: "b", authorName: "Bob", content: "Reply" });
    const snapshot = JSON.parse(JSON.stringify(manager.exportState()));
    const restored = new CommentsManager(editor, { initialState: snapshot });
    cleanup.push(() => restored.destroy());
    expect(restored.exportState()).toEqual(manager.exportState());
    expect(() =>
      restored.loadState({ version: 1, comments: [snapshot.comments[0], snapshot.comments[0]] }),
    ).toThrow("Duplicate");
    expect(restored.exportState()).toEqual(manager.exportState());
    editor.setContent("different text");
    expect(restored.getComment(comment.id)!.orphaned).toBe(true);
    restored.reanchorComment(comment.id, {
      blockId: editor.getJSON().blocks[0]!.id,
      from: 0,
      to: 9,
    });
    expect(restored.getComment(comment.id)!.quotedText).toBe("different");
  });
  it("rejects invalid ranges and blank text without events and isolates host callback failures", async () => {
    const { editor, manager } = await setup({
      onChange: () => {
        throw new Error("host offline");
      },
    });
    const errors = vi.fn();
    editor.on("error", errors);
    expect(() =>
      manager.addComment({
        blockId: "missing",
        from: 0,
        to: 0,
        authorId: "a",
        authorName: "A",
        content: "Text",
      }),
    ).toThrow();
    expect(() =>
      manager.addComment({
        blockId: "a",
        from: 0,
        to: 1,
        authorId: "a",
        authorName: "A",
        content: " ",
      }),
    ).toThrow();
    expect(manager.getComments()).toEqual([]);
    manager.addComment({
      blockId: "a",
      from: 0,
      to: 1,
      authorId: "a",
      authorName: "A",
      content: "Text",
    });
    expect(manager.getComments()).toHaveLength(1);
    expect(errors).toHaveBeenCalledTimes(1);
    manager.destroy();
    expect(editor.getDecorations()).toEqual([]);
    expect(() => manager.resolveComment("id", "a")).toThrow("destroyed");
  });
});

describe("a quote whose context is edited (D-290)", () => {
  // The quote opens the second block, so its anchor context reaches into the first one.
  async function draft() {
    const editor = await createEditor({
      extensions: [],
      content: {
        version: 1,
        blocks: ["Discuss a draft", "Select a phrase to start a discussion."].map(
          (text, index) => ({
            id: index ? "b" : "a",
            type: "paragraph",
            attrs: {},
            content: [{ text, marks: [] }],
            children: [],
          }),
        ),
      },
    });
    const manager = new CommentsManager(editor);
    cleanup.push(() => {
      manager.destroy();
      editor.destroy();
    });
    const comment = manager.addComment({
      blockId: "b",
      from: 0,
      to: 15,
      authorId: "alice",
      authorName: "Alice",
      content: "Needs details 😀",
    });
    const type = (offset: number, text: string) =>
      editor.dispatch({ steps: [{ type: "insertText", blockId: "b", offset, text, marks: [] }] });
    return { editor, manager, id: comment.id, type };
  }

  it("follows text typed at the start of its block, reloads, orphans on removal and returns with Undo", async () => {
    const { editor, manager, id, type } = await draft();
    type(0, "Префикс 😀 ");
    const moved = {
      blockId: "b",
      from: 11,
      to: 26,
      quotedText: "Select a phrase",
      orphaned: false,
    };
    expect(manager.getComment(id)).toMatchObject(moved);
    expect(editor.getDecorations()).toMatchObject([{ blockId: "b", from: 11, to: 26 }]);
    // The saved anchor names the quote in the edited text, so a reload finds it there.
    const reloaded = new CommentsManager(editor, {
      initialState: JSON.parse(JSON.stringify(manager.exportState())),
    });
    expect(reloaded.getComment(id)).toMatchObject(moved);
    reloaded.destroy();
    editor.dispatch({ steps: [{ type: "deleteText", blockId: "b", from: 11, to: 26 }] });
    expect(manager.getComment(id)!.orphaned).toBe(true);
    expect(editor.getDecorations()).toEqual([]);
    editor.undo();
    expect(manager.getComment(id)).toMatchObject(moved);
    editor.undo();
    expect(manager.getComment(id)).toMatchObject({ from: 0, to: 15, orphaned: false });
    expect(editor.getDecorations()).toMatchObject([{ blockId: "b", from: 0, to: 15 }]);
  });

  it("stays on its text when typing touches its edges, and orphans when the quote itself changes", async () => {
    const { manager, id, type } = await draft();
    type(15, " 🦀");
    expect(manager.getComment(id)).toMatchObject({ from: 0, to: 15, orphaned: false });
    type(0, "S");
    expect(manager.getComment(id)).toMatchObject({ from: 1, to: 16, orphaned: false });
    type(7, "ed");
    expect(manager.getComment(id)).toMatchObject({ orphaned: true, quotedText: "Select a phrase" });
  });

  it("keeps its place when a copy of the quoted text appears and stays unique for a reload", async () => {
    const { editor, manager, id } = await draft();
    const copy = {
      id: "c",
      type: "paragraph",
      attrs: {},
      content: [{ text: "Select a phrase to start a discussion.", marks: [] }],
      children: [],
    };
    // Now "a draft\n" before the copy too: the old context occurs twice.
    editor.dispatch({
      steps: [
        { type: "insertBlock", parentId: null, index: 2, block: copy },
        {
          type: "insertBlock",
          parentId: null,
          index: 2,
          block: { ...copy, id: "d", content: [{ text: "Discuss a draft", marks: [] }] },
        },
      ],
    });
    expect(manager.getComment(id)).toMatchObject({ blockId: "b", from: 0, orphaned: false });
    const reloaded = new CommentsManager(editor, { initialState: manager.exportState() });
    expect(reloaded.getComment(id)).toMatchObject({ blockId: "b", from: 0, orphaned: false });
    reloaded.destroy();
  });
});

describe("a page served over plain HTTP (D-85)", () => {
  it("creates a manager, comments and replies without crypto.randomUUID", async () => {
    const { editor } = await setup();
    // the editor is ready; the page has getRandomValues only, as outside a secure context
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => platform.getRandomValues(array),
    });
    const manager = new CommentsManager(editor);
    cleanup.push(() => manager.destroy());
    const comment = manager.addComment({
      blockId: "a",
      from: 6,
      to: 11,
      authorId: "alice",
      authorName: "Alice",
      content: "Review this phrase",
    });
    const reply = manager.addReply(comment.id, {
      authorId: "bob",
      authorName: "Bob",
      content: "Done",
    })!;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(comment.id).toMatch(uuid);
    expect(reply.id).toMatch(uuid);
    expect(editor.getDecorations().length).toBeGreaterThan(0);
  });
});
