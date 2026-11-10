import { createEditor } from "@gotipe/core/js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommentsManager } from "./manager";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanup.splice(0)) stop();
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
