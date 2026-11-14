import { afterEach, describe, expect, it } from "vitest";
import { CodeBlock, Divider, Heading, Paragraph, Table, TrailingNode } from "../src/extensions";
import type { GoTipeEditor } from "../src/types/editor";
import { ENGINES, block, createOn, doc, paragraph, text } from "./engines";

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe.each(ENGINES)("%s trailing node", (engine) => {
  async function setup(
    content = doc(paragraph("p", "a"), block("c", "codeBlock", "x", { language: "" })),
    editable = true,
  ) {
    const editor = await createOn(engine, {
      extensions: [Paragraph, Heading, CodeBlock, Divider, Table, TrailingNode],
      content,
      editable,
    });
    editors.push(editor);
    return editor;
  }
  const types = (editor: GoTipeEditor) => editor.getJSON().blocks.map((item) => item.type);

  it("adds an empty paragraph after a final block on load without an undo step", async () => {
    const editor = await setup();
    expect(types(editor)).toEqual(["paragraph", "codeBlock", "paragraph"]);
    expect(editor.getJSON().blocks[2]!.content).toEqual([]);
    expect(editor.getViewState().toolbar.canUndo).toBe(false);
    expect(editor.undo()).toBe(false);
  });

  it("keeps one after edits, undo and setContent, and does not break redo", async () => {
    const editor = await setup(doc(paragraph("p", "a")));
    expect(types(editor)).toEqual(["paragraph"]);
    editor.dispatch({
      steps: [
        {
          type: "insertBlock",
          parentId: null,
          index: 1,
          block: block("d", "divider", null),
        },
      ],
    });
    expect(types(editor)).toEqual(["paragraph", "divider", "paragraph"]);
    expect(editor.undo()).toBe(true);
    expect(types(editor)).toEqual(["paragraph"]);
    expect(editor.redo()).toBe(true);
    expect(types(editor)).toEqual(["paragraph", "divider", "paragraph"]);
    editor.setContent(doc(block("h", "heading", text("Т"), { level: 1 })));
    expect(types(editor)).toEqual(["heading", "paragraph"]);
    expect(editor.undo()).toBe(false);
  });

  it("adds configured types to the default and never appends after its own block type", async () => {
    const editor = await createOn(engine, {
      extensions: [
        Paragraph,
        Heading,
        CodeBlock,
        TrailingNode.configure({ notAfter: ["heading"] }),
      ],
      content: doc(paragraph("p", "a")),
    });
    editors.push(editor);
    for (const letter of ["b", "c", "d"])
      editor.dispatch({
        steps: [{ type: "insertText", blockId: "p", offset: 0, text: letter, marks: [] }],
      });
    expect(types(editor)).toEqual(["paragraph"]);
    editor.setContent(doc(block("h", "heading", text("Т"), { level: 1 })));
    expect(types(editor)).toEqual(["heading"]);
    editor.setContent(doc(block("c", "codeBlock", "x", { language: "" })));
    expect(types(editor)).toEqual(["codeBlock", "paragraph"]);
  });

  it("waits while read-only and adds the block when editing is enabled", async () => {
    const editor = await setup(undefined, false);
    expect(types(editor)).toEqual(["paragraph", "codeBlock"]);
    editor.setEditable(true);
    expect(types(editor)).toEqual(["paragraph", "codeBlock", "paragraph"]);
    expect(editor.undo()).toBe(false);
  });
});

describe("trailing node with collaboration (two WASM replicas)", () => {
  const types = (editor: GoTipeEditor) => editor.getJSON().blocks.map((item) => item.type);
  const extensions = [Paragraph, Heading, CodeBlock, Divider, Table, TrailingNode];
  const baseline = () => doc(paragraph("p", "a"), block("c", "codeBlock", "x", { language: "" }));
  const insertText = (editor: GoTipeEditor, text: string) =>
    editor.dispatch({ steps: [{ type: "insertText", blockId: "p", offset: 0, text, marks: [] }] });
  const sync = (from: GoTipeEditor, to: GoTipeEditor) =>
    to.receiveCollaborationUpdate(from.getCollaborationUpdate());

  it("keeps the shared baseline and lets only the editing replica append", async () => {
    const a = await createOn("wasm", { extensions, content: baseline() });
    const b = await createOn("wasm", { extensions, content: baseline() });
    editors.push(a, b);
    // Alone, each editor has added its own paragraph to the loaded document.
    expect(types(a)).toEqual(["paragraph", "codeBlock", "paragraph"]);
    expect(a.getJSON().blocks[2]!.id).not.toBe(b.getJSON().blocks[2]!.id);
    a.enableCollaboration("peer-a");
    b.enableCollaboration("peer-b");
    // It is taken back: both replicas start from the document that was loaded.
    expect(a.getJSON().blocks).toEqual(baseline().blocks);
    expect(b.getJSON().blocks).toEqual(baseline().blocks);

    insertText(a, "Ж");
    expect(types(a)).toEqual(["paragraph", "codeBlock", "paragraph"]);
    sync(a, b);
    // The receiving replica appends nothing of its own: one paragraph, the same block.
    expect(b.getJSON().blocks).toEqual(a.getJSON().blocks);
    insertText(b, "😀");
    sync(b, a);
    expect(types(a)).toEqual(["paragraph", "codeBlock", "paragraph"]);
    expect(a.getJSON().blocks).toEqual(b.getJSON().blocks);
    expect(a.getText()).toBe("😀Жa\nx\n");
  });

  it("does not count an atom repair as its own edit", async () => {
    const a = await createOn("wasm", { extensions, content: baseline() });
    editors.push(a);
    a.enableCollaboration("peer-a");
    // What `receiveCollaborationUpdate` dispatches when it repairs inline atoms.
    a.dispatch({
      steps: [
        { type: "insertBlock", parentId: null, index: 2, block: block("d", "divider", null) },
      ],
      metadata: { addToHistory: false, origin: "repair" },
    });
    expect(types(a)).toEqual(["paragraph", "codeBlock", "divider"]);
    insertText(a, "я");
    expect(types(a)).toEqual(["paragraph", "codeBlock", "divider", "paragraph"]);
  });

  it("never appends in response to a remote update, only after its own edit", async () => {
    const start = () => doc(paragraph("p", "a"));
    const plain = await createOn("wasm", {
      extensions: extensions.filter((extension) => extension !== TrailingNode),
      content: start(),
    });
    const b = await createOn("wasm", { extensions, content: start() });
    editors.push(plain, b);
    plain.enableCollaboration("peer-a");
    b.enableCollaboration("peer-b");
    plain.dispatch({
      steps: [
        { type: "insertBlock", parentId: null, index: 1, block: block("d", "divider", null) },
      ],
    });
    sync(plain, b);
    expect(types(b)).toEqual(["paragraph", "divider"]);
    // Undo with nothing of its own to undo and a selection change are not edits either.
    b.undo();
    b.setSelection({ anchor: { blockId: "p", offset: 1 }, head: { blockId: "p", offset: 1 } });
    expect(types(b)).toEqual(["paragraph", "divider"]);
    insertText(b, "я");
    expect(types(b)).toEqual(["paragraph", "divider", "paragraph"]);
    sync(b, plain);
    expect(plain.getJSON().blocks).toEqual(b.getJSON().blocks);
    // The appended block is not an undo step of its replica.
    expect(b.undo()).toBe(true);
    expect(b.getText()).toBe("a\n\n");
    expect(types(b)).toEqual(["paragraph", "divider", "paragraph"]);
  });
});
