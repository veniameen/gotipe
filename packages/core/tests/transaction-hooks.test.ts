// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { createEditorWithLoader } from "../src/editor";
import { FullPreset } from "../src/presets";

beforeAll(() => {
  wasm.initSync({
    module: readFileSync(new URL("../../wasm/pkg/gotipe_wasm_bg.wasm", import.meta.url)),
  });
});
describe.each(["js", "wasm"] as const)("%s transaction hooks", (engine) => {
  const create = () =>
    createEditorWithLoader(
      {
        engine,
        extensions: FullPreset,
        content: {
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
        },
      },
      engine === "wasm" ? async () => wasm : null,
    );
  const change = {
    steps: [{ type: "insertText", blockId: "p", offset: 4, text: "😀", marks: [] }],
    selection: { type: "cursor", blockId: "p", offset: 6 },
  };
  it("validates before filters and cancels without changing document, caret, history or observers", async () => {
    const editor = await create();
    const before = editor.getViewState().selection;
    const filter = vi.fn(() => false);
    const transaction = vi.fn();
    editor.on("transaction", transaction);
    const stop = editor.addTransactionFilter(filter);
    expect(() =>
      editor.dispatch({
        steps: [{ type: "insertText", blockId: "missing", offset: 0, text: "x", marks: [] }],
      }),
    ).toThrow();
    expect(filter).not.toHaveBeenCalled();
    expect(editor.dispatch(change)).toBe(false);
    expect(editor.getText()).toBe("base");
    expect(editor.getViewState().selection).toEqual(before);
    expect(editor.undo()).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
    stop();
    expect(editor.dispatch(change)).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(editor.getText()).toBe("base😀");
    editor.destroy();
  });
  it("publishes committed snapshots and isolates observer errors from accepted mutations", async () => {
    const editor = await create();
    const errors = vi.fn();
    editor.on("error", errors);
    const seen: string[] = [];
    editor.addTransactionFilter(({ before, after }) => {
      expect(after.blocks[0]!.content).toEqual([{ text: "base😀", marks: [] }]);
      before.blocks.length = 0;
      after.blocks.length = 0;
      return true;
    });
    editor.on("transaction", ({ before, after, editor: current }) => {
      expect(before.blocks).toHaveLength(1);
      expect(after.blocks).toHaveLength(1);
      seen.push(current.getText());
      throw new Error("listener failure");
    });
    editor.on("update", () => seen.push("update"));
    expect(editor.dispatch(change)).toBe(true);
    expect(seen).toEqual(["base😀", "update"]);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("base");
    editor.destroy();
  });
  it("rejects nested dispatch from filters even when the filter removes itself", async () => {
    const editor = await create();
    const stop = editor.addTransactionFilter(() => {
      stop();
      editor.dispatch(change);
      return true;
    });
    expect(() => editor.dispatch(change)).toThrow("cannot dispatch");
    expect(editor.getText()).toBe("base");
    expect(editor.undo()).toBe(false);
    editor.destroy();
  });
});
