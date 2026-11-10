// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { createEditorWithLoader } from "../src/editor";
import { FullPreset } from "../src/presets";

beforeAll(() => {
  wasm.initSync({
    module: readFileSync(new URL("../../wasm/pkg/gotipe_wasm_bg.wasm", import.meta.url)),
  });
});

describe("real WASM public contract", () => {
  it.each(["js", "wasm"] as const)(
    "preserves independent color marks and one undo in %s",
    async (engine) => {
      const editor = await createEditorWithLoader(
        { extensions: FullPreset, engine, content: "Цвет😀" },
        async () => wasm,
      );
      try {
        const blockId = editor.getJSON().blocks[0]!.id;
        editor.setSelection({ anchor: { blockId, offset: 0 }, head: { blockId, offset: 6 } });
        expect(
          editor
            .chain()
            .setMark("textColor", { color: "#123abc" })
            .setMark("highlight", { color: "#fef9c3" })
            .run(),
        ).toBe(true);
        expect(editor.getHTML()).toMatch(/style="color:\s*#123abc"/);
        expect(editor.getHTML()).toMatch(/style="background(?:-color)?:\s*#fef9c3"/);
        expect(editor.getMarkdown()).toMatch(/style="color:\s*#123abc"/);
        expect(editor.getMarkdown()).toMatch(/style="background(?:-color)?:\s*#fef9c3"/);
        expect(editor.undo()).toBe(true);
        expect(editor.getJSON().blocks[0]!.content).toEqual([{ text: "Цвет😀", marks: [] }]);
      } finally {
        editor.destroy();
      }
    },
  );
  it.each(["wasm", "auto"] as const)(
    "creates the full public preset with %s and keeps Unicode text",
    async (engine) => {
      const editor = await createEditorWithLoader(
        { extensions: FullPreset, engine, content: "Привет😀" },
        async () => wasm,
      );
      expect(editor.engine).toBe("wasm");
      expect(editor.getText()).toBe("Привет😀");
      const id = editor.getViewState().blocks[0]!.id;
      editor.dispatch({
        steps: [
          {
            type: "insertText",
            blockId: id,
            offset: 8,
            text: "!",
            marks: [{ type: "bold", attrs: {} }],
          },
        ],
      });
      expect(editor.getText()).toBe("Привет😀!");
      expect(editor.getHTML()).toContain("<strong>!</strong>");
      editor.destroy();
    },
  );

  it("selectively undoes local text while preserving and replicating a peer's concurrent edit", async () => {
    const content = {
      version: 1,
      blocks: [
        {
          id: "p",
          type: "paragraph",
          attrs: {},
          content: [{ text: "base", marks: [] }],
          children: [],
        },
      ],
    };
    const a = await createEditorWithLoader(
      { extensions: FullPreset, engine: "wasm", content },
      async () => wasm,
    );
    const b = await createEditorWithLoader(
      { extensions: FullPreset, engine: "wasm", content },
      async () => wasm,
    );
    a.enableCollaboration("a");
    b.enableCollaboration("b");
    a.setSelection({ anchor: { blockId: "p", offset: 4 }, head: { blockId: "p", offset: 4 } });
    b.setSelection({ anchor: { blockId: "p", offset: 4 }, head: { blockId: "p", offset: 4 } });
    a.dispatch({ steps: [{ type: "insertText", blockId: "p", offset: 4, text: "X", marks: [] }] });
    b.dispatch({ steps: [{ type: "insertText", blockId: "p", offset: 4, text: "Y", marks: [] }] });
    const aLocal = a.getCollaborationUpdate();
    a.receiveCollaborationUpdate(b.getCollaborationUpdate());
    b.receiveCollaborationUpdate(aLocal);
    expect(a.getText()).toBe(b.getText());
    expect(a.getViewState().toolbar.canUndo).toBe(true);
    expect(a.undo()).toBe(true);
    expect(a.getText()).toBe("baseY");
    expect(a.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 4 });
    b.receiveCollaborationUpdate(a.getCollaborationUpdate());
    expect(b.getText()).toBe("baseY");
    expect(a.redo()).toBe(true);
    b.receiveCollaborationUpdate(a.getCollaborationUpdate());
    expect(a.getText()).toBe(b.getText());
    expect(a.getText()).toContain("X");
    a.setContent(content);
    expect(a.getViewState().toolbar.canUndo).toBe(false);
    expect(a.undo()).toBe(false);
    a.destroy();
    b.destroy();
  });

  it("restores a directed cross-block selection with native collaboration undo", async () => {
    const content = {
      version: 1,
      blocks: ["a", "b"].map((id) => ({
        id,
        type: "paragraph",
        attrs: {},
        content: [{ text: "text", marks: [] }],
        children: [],
      })),
    };
    const editor = await createEditorWithLoader(
      { extensions: FullPreset, engine: "wasm", content },
      async () => wasm,
    );
    editor.enableCollaboration("selection-peer");
    const selection = { anchor: { blockId: "b", offset: 3 }, head: { blockId: "a", offset: 1 } };
    editor.setSelection(selection);
    editor.dispatch({ steps: [{ type: "deleteText", blockId: "a", from: 1, to: 2 }] });
    expect(editor.undo()).toBe(true);
    expect(editor.getViewState().selection).toEqual({ type: "text", ...selection });
    editor.destroy();
  });
});
