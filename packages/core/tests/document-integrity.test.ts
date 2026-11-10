import { describe, expect, it } from "vitest";
import { createEditor } from "../src/js";
import type { Block } from "../src/types/block";

function block(id: string, type: string, text: string | null, children: Block[] = []): Block {
  return {
    id,
    type,
    attrs: {},
    content: text === null ? null : [{ text, marks: [] }],
    children,
  };
}

function doc(...blocks: Block[]) {
  return { version: 1, blocks };
}

describe("document text", () => {
  it("accepts typing into the default empty paragraph", async () => {
    const editor = await createEditor({ extensions: [] });
    const id = editor.getViewState().blocks[0]!.id;
    editor.dispatch({
      steps: [{ type: "insertText", blockId: id, offset: 0, text: "Hello", marks: [] }],
    });
    expect(editor.getText()).toBe("Hello");
    editor.destroy();
  });

  it("rejects an edit inside an emoji without changing the document", async () => {
    const editor = await createEditor({
      extensions: [],
      content: doc(block("a", "paragraph", "a😀b")),
    });
    expect(() =>
      editor.dispatch({
        steps: [{ type: "deleteText", blockId: "a", from: 1, to: 2 }],
      }),
    ).toThrow(/Unicode character/);
    expect(editor.getText()).toBe("a😀b");
    expect(editor.undo()).toBe(false);
    editor.destroy();
  });

  it("exports nested lists and table cells without dropping their text", async () => {
    const editor = await createEditor({
      extensions: [],
      content: doc(
        block("title", "heading", "Заметки"),
        block("list", "bulletList", null, [
          block("one", "listItem", "Первый", [
            block("nested", "bulletList", null, [block("child", "listItem", "Вложенный")]),
          ]),
          block("two", "listItem", "Второй"),
        ]),
        block("table", "table", null, [
          block("row", "tableRow", null, [
            block("a", "tableCell", "Имя"),
            block("b", "tableCell", "Значение"),
          ]),
        ]),
        { ...block("code", "codeBlock", null), content: "const x = 1;\nconsole.log(x);" },
      ),
    });
    expect(editor.getText()).toBe(
      "Заметки\nПервый\nВложенный\nВторой\nИмя\tЗначение\nconst x = 1;\nconsole.log(x);",
    );
    editor.destroy();
  });
});

describe("Unicode keyboard deletion", () => {
  it.each(["😀", "👨‍👩‍👧", "e\u0301"])("Backspace deletes the whole grapheme %s", async (text) => {
    const editor = await createEditor({
      extensions: [],
      content: doc(block("a", "paragraph", `X${text}Y`)),
    });
    const root = document.createElement("div");
    const paragraph = document.createElement("p");
    paragraph.dataset.blockId = "a";
    paragraph.dataset.blockType = "paragraph";
    paragraph.textContent = `X${text}Y`;
    root.append(paragraph);
    document.body.append(root);
    editor.mount(root);
    editor.setSelection({
      anchor: { blockId: "a", offset: 1 + text.length },
      head: { blockId: "a", offset: 1 + text.length },
    });
    root.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "deleteContentBackward",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(editor.getText()).toBe("XY");
    expect(editor.getViewState().selection.anchor.offset).toBe(1);
    editor.destroy();
    root.remove();
  });
});

describe("document history", () => {
  it("commits an explicit transaction caret before subscribers observe the document", async () => {
    const editor = await createEditor({
      extensions: [],
      content: doc(block("a", "paragraph", "A")),
    });
    const seen: number[] = [];
    editor.on("update", () => seen.push(editor.getViewState().selection.anchor.offset));
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "a", offset: 1, text: "😀", marks: [] }],
      selection: { type: "cursor", blockId: "a", offset: 3 },
    });
    expect(seen).toEqual([3]);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "a", offset: 3 });
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("A");
    expect(editor.redo()).toBe(true);
    expect(editor.getViewState().selection.anchor.offset).toBe(3);
    editor.destroy();
  });

  it.each([
    { type: "cursor", blockId: "missing", offset: 0 },
    { type: "cursor", blockId: "a", offset: 9 },
    { type: "cursor", blockId: "a", offset: 2 },
  ])("rejects invalid final selection atomically: %j", async (selection) => {
    const editor = await createEditor({
      extensions: [],
      content: doc(block("a", "paragraph", "A")),
    });
    expect(() =>
      editor.dispatch({
        steps: [{ type: "insertText", blockId: "a", offset: 1, text: "😀", marks: [] }],
        selection,
      }),
    ).toThrow(/Selection/);
    expect(editor.getText()).toBe("A");
    expect(editor.undo()).toBe(false);
    editor.destroy();
  });

  it("applies selection-only transactions without consuming document history", async () => {
    const editor = await createEditor({
      extensions: [],
      content: doc(block("a", "paragraph", "ABC")),
    });
    editor.dispatch({ steps: [], selection: { type: "text", blockId: "a", from: 1, to: 3 } });
    expect(editor.getViewState().selection).toEqual({
      type: "text",
      anchor: { blockId: "a", offset: 1 },
      head: { blockId: "a", offset: 3 },
    });
    expect(editor.undo()).toBe(false);
    editor.destroy();
  });

  it("does not restore another document after setContent", async () => {
    const editor = await createEditor({
      extensions: [],
      content: doc(block("a", "paragraph", "Old")),
    });
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "a", offset: 3, text: "!", marks: [] }],
    });
    editor.undo();
    expect(editor.getViewState().toolbar.canRedo).toBe(true);
    editor.setContent(doc(block("b", "paragraph", "New")));
    expect(editor.getViewState().toolbar).toMatchObject({ canUndo: false, canRedo: false });
    expect(editor.undo()).toBe(false);
    expect(editor.redo()).toBe(false);
    expect(editor.getText()).toBe("New");
    editor.destroy();
  });

  it("restores the caret in its restored block on undo and redo", async () => {
    const editor = await createEditor({
      extensions: [],
      content: doc(block("a", "paragraph", "Original")),
    });
    editor.setSelection({ anchor: { blockId: "a", offset: 4 }, head: { blockId: "a", offset: 4 } });
    editor.dispatch({
      steps: [
        { type: "insertBlock", parentId: null, index: 1, block: block("b", "paragraph", "Next") },
      ],
    });
    editor.setSelection({ anchor: { blockId: "b", offset: 2 }, head: { blockId: "b", offset: 2 } });
    expect(editor.undo()).toBe(true);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "a", offset: 4 });
    expect(editor.getText()).toBe("Original");
    expect(editor.redo()).toBe(true);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "b", offset: 2 });
    expect(editor.getText()).toBe("Original\nNext");
    editor.destroy();
  });

  it("keeps external edits undoable when addToHistory is explicitly enabled", async () => {
    const editor = await createEditor({
      extensions: [],
      content: doc(block("a", "paragraph", "Original")),
    });
    editor.setSelection({ anchor: { blockId: "a", offset: 5 }, head: { blockId: "a", offset: 5 } });
    editor.setContent(doc(block("a", "paragraph", "New")), {
      addToHistory: true,
      preserveSelection: true,
    });
    expect(editor.getViewState().selection.anchor.offset).toBe(3);
    editor.undo();
    expect(editor.getText()).toBe("Original");
    expect(editor.getViewState().selection.anchor.offset).toBe(5);
    editor.redo();
    expect(editor.getText()).toBe("New");
    expect(editor.getViewState().selection.anchor.offset).toBe(3);
    editor.destroy();
  });

  it("ignores empty transactions without consuming undo", async () => {
    const editor = await createEditor({
      extensions: [],
      content: doc(block("a", "paragraph", "Text")),
    });
    editor.dispatch({ steps: [] });
    expect(editor.undo()).toBe(false);
    editor.destroy();
  });
});
