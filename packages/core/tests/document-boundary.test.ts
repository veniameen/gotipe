// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { ClipboardHandler } from "../src/clipboard/handler";
import { createEditorWithLoader } from "../src/editor";
import { Paragraph } from "../src/extensions/paragraph";
import { FullPreset } from "../src/presets";
import { defineExtension } from "../src/types/extension";

beforeAll(() => {
  wasm.initSync({
    module: readFileSync(new URL("../../wasm/pkg/gotipe_wasm_bg.wasm", import.meta.url)),
  });
});
describe.each(["js", "wasm"] as const)("%s document boundary", (engine) => {
  const create = (content: object) =>
    createEditorWithLoader(
      { engine, extensions: FullPreset, content },
      engine === "wasm" ? async () => wasm : null,
    );
  const block = {
    id: "a",
    type: "paragraph",
    attrs: {},
    content: [{ text: "before", marks: [] }],
    children: [],
  };
  it("validates canonical public documents and JSON, rejects schema errors, and permits a real paste", async () => {
    const editor = await create({ version: 1, blocks: [block] });
    expect(editor.validate(editor.getJSON())).toBe(true);
    expect(editor.validate(JSON.stringify(editor.getJSON()))).toBe(true);
    for (const invalid of [
      "{",
      {},
      { blocks: [block, block] },
      { blocks: [{ ...block, type: "unknown" }] },
      { blocks: [{ ...block, attrs: { unknown: true } }] },
      { blocks: [{ ...block, content: "invalid raw paragraph" }] },
      { blocks: [{ ...block, content: [{ text: "x", marks: [{ type: "missing", attrs: {} }] }] }] },
      { blocks: [{ ...block, type: "heading", attrs: { level: "wrong" } }] },
    ])
      expect(editor.validate(invalid)).toBe(false);
    editor.setSelection({ anchor: { blockId: "a", offset: 6 }, head: { blockId: "a", offset: 6 } });
    const handler = new ClipboardHandler(editor);
    handler.onPaste({
      preventDefault() {},
      clipboardData: { getData: (type: string) => (type === "text/plain" ? "Ж😀" : "") },
    } as unknown as ClipboardEvent);
    expect(editor.getText()).toBe("beforeЖ😀");
    editor.undo();
    expect(editor.getText()).toBe("before");
    handler.destroy();
    editor.destroy();
  });
  it("rejects malformed replacement and duplicate initial IDs without mutating content or history", async () => {
    const editor = await create({ version: 1, blocks: [block] });
    for (const value of [
      {},
      { blocks: {} },
      { blocks: [{ ...block, content: { unknown: "text" } }] },
      { blocks: [block, block] },
    ]) {
      expect(() => editor.setContent(value)).toThrow();
      expect(editor.getText()).toBe("before");
      expect(editor.getViewState().toolbar.canUndo).toBe(false);
    }
    await expect(create({ blocks: [block, block] })).rejects.toThrow("Duplicate");
    editor.destroy();
  });
  it("rejects schema-invalid transactions atomically before content, selection and history change", async () => {
    const editor = await create({ version: 1, blocks: [block] });
    const before = editor.getJSON();
    const selection = editor.getViewState().selection;
    for (const transaction of [
      {
        steps: [
          { type: "insertText", blockId: "a", offset: 0, text: "partial", marks: [] },
          { type: "setBlockAttrs", blockId: "a", attrs: { unknown: true } },
        ],
      },
      {
        steps: [
          {
            type: "insertBlock",
            parentId: null,
            index: 1,
            block: { ...block, id: "invalid", type: "listItem" },
          },
        ],
      },
      {
        steps: [
          { type: "setBlockType", blockId: "a", newType: "heading", attrs: { level: "wrong" } },
        ],
      },
    ]) {
      expect(() => editor.dispatch(transaction)).toThrow("schema");
      expect(editor.getJSON()).toEqual(before);
      expect(editor.getViewState().selection).toEqual(selection);
      expect(editor.undo()).toBe(false);
    }
    editor.destroy();
  });
  it("rejects forbidden and malformed stored marks without changing toolbar or history", async () => {
    const editor = await create({ blocks: [
      { ...block, id: "code", type: "codeBlock", attrs: { language: "" }, content: "text" },
      block,
    ] });
    for (const [blockId, mark] of [
      ["code", { type: "bold", attrs: {} }],
      ["a", { type: "textColor", attrs: { color: 42 } }],
      ["a", { type: "missing", attrs: {} }],
    ] as const) {
      editor.setSelection({ anchor: { blockId, offset: 0 }, head: { blockId, offset: 0 } });
      const before = editor.getJSON();
      expect(() => editor.dispatch({ steps: [{ type: "addMark", blockId, from: 0, to: 0, mark }] }))
        .toThrow("schema");
      expect(() => editor.dispatch({ steps: [{ type: "insertText", blockId, offset: 0, text: "", marks: [mark] }] }))
        .toThrow("schema");
      expect(editor.getJSON()).toEqual(before);
      expect(editor.getViewState().toolbar.activeMarks).toEqual([]);
      expect(editor.undo()).toBe(false);
    }
    // Mark validation uses the state produced by earlier steps in the same transaction.
    editor.dispatch({ steps: [
      { type: "insertBlock", parentId: null, index: 2, block: { ...block, id: "new" } },
      { type: "addMark", blockId: "new", from: 0, to: 6, mark: { type: "bold", attrs: {} } },
    ] });
    expect(editor.getJSON().blocks[2]!.content).toEqual([
      { text: "before", marks: [{ type: "bold", attrs: {} }] },
    ]);
    editor.destroy();
  });
  it("keeps an explicitly empty schema structural while allowing custom blocks and marks", async () => {
    const editor = await createEditorWithLoader(
      { engine, extensions: [], content: { blocks: [{ ...block, type: "custom" }] } },
      engine === "wasm" ? async () => wasm : null,
    );
    editor.dispatch({ steps: [
      { type: "insertBlock", parentId: null, index: 1, block: { ...block, id: "new", type: "other" } },
      { type: "addMark", blockId: "new", from: 0, to: 6, mark: { type: "customMark", attrs: { key: "value" } } },
      { type: "setBlockType", blockId: "new", newType: "final", attrs: { custom: true } },
    ] });
    expect(editor.getJSON().blocks[1]).toMatchObject({
      type: "final", attrs: { custom: true },
      content: [{ text: "before", marks: [{ type: "customMark", attrs: { key: "value" } }] }],
    });
    expect(editor.validate(editor.getJSON())).toBe(true);
    expect(editor.undo()).toBe(true);
    expect(editor.getJSON().blocks).toHaveLength(1);
    editor.destroy();
  });
  it("preserves nested JSON attributes including table alignment and extension settings", async () => {
    const attrs = {
      align: ["left", "center", null],
      settings: { enabled: true, options: [1, { key: "значение" }] },
    };
    const editor = await createEditorWithLoader(
      {
        engine,
        extensions: [
          ...FullPreset,
          defineExtension({
            ...Paragraph,
            nodes: [
              {
                ...Paragraph.nodes![0]!,
                attrs: { align: { type: "array" }, settings: { type: "object" } },
              },
            ],
          }),
        ],
        content: { version: 1, blocks: [{ ...block, attrs }] },
      },
      engine === "wasm" ? async () => wasm : null,
    );
    expect(editor.getJSON().blocks[0]!.attrs).toEqual(attrs);
    const copy = editor.getJSON();
    copy.blocks[0]!.attrs.align = [];
    expect(editor.getJSON().blocks[0]!.attrs).toEqual(attrs);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => editor.setContent({ blocks: [{ ...block, attrs: cyclic }] })).toThrow("cycles");
    expect(editor.getJSON().blocks[0]!.attrs).toEqual(attrs);
    editor.destroy();
  });
});
