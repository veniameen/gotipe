import { afterEach, describe, expect, it } from "vitest";
import { DefaultPreset } from "../src/presets";
import type { Document } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { ENGINES, type Engine, createOn, mountForTyping, paragraph } from "./engines";

// D-13: `Document.version` grows by one with every applied step on both engines, as
// `next_version` in Rust; a rejected transaction and an undo leave nothing of theirs.
const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

async function open(engine: Engine) {
  const content: Document = { version: 7, blocks: [paragraph("a", "ab"), paragraph("b", "cd")] };
  const editor = await createOn(engine, { extensions: DefaultPreset, content });
  editors.push(editor);
  return editor;
}

const version = (editor: GoTipeEditor) => editor.getJSON().version;

async function edited(engine: Engine) {
  const editor = await open(engine);
  editor.dispatch({
    steps: [
      { type: "insertText", blockId: "a", offset: 2, text: "!", marks: [] },
      { type: "setBlockAttrs", blockId: "b", attrs: { align: "center" } },
      { type: "insertBlock", parentId: null, index: 2, block: paragraph("c", "ef") },
    ],
  });
  return editor;
}

describe.each(ENGINES)("%s engine: Document.version (D-13)", (engine) => {
  it("grows by one with every applied step", async () => {
    const editor = await edited(engine);
    expect(version(editor)).toBe(10);
    expect(editor.chain().setBlockType("heading", { level: 2 }).run()).toBe(true);
    expect(version(editor)).toBe(11);
  });

  it("stays when a transaction is rejected, a selection moves or nothing applies", async () => {
    const editor = await open(engine);
    expect(() =>
      editor.dispatch({
        steps: [
          { type: "insertText", blockId: "a", offset: 0, text: "x", marks: [] },
          { type: "deleteBlock", blockId: "missing" },
        ],
      }),
    ).toThrow();
    editor.setSelection({ anchor: { blockId: "b", offset: 1 }, head: { blockId: "b", offset: 2 } });
    editor.dispatch({ steps: [] });
    expect(version(editor)).toBe(7);
  });

  it("typing counts its steps, and undo brings back the version from before", async () => {
    const editor = await open(engine);
    const typing = mountForTyping(editor);
    typing.caret("a", 2);
    typing.type("xyz");
    expect(version(editor)).toBe(10);
    expect(editor.undo()).toBe(true);
    expect(version(editor)).toBe(7);
    expect(editor.redo()).toBe(true);
    expect(version(editor)).toBe(10);
  });
});

it("both engines give the same document for the same edits, version included", async () => {
  const [js, wasm] = await Promise.all(ENGINES.map(edited));
  expect(JSON.stringify(js!.getJSON())).toBe(JSON.stringify(wasm!.getJSON()));
});
