import { describe, expect, it, vi } from "vitest";
import { Paragraph, Placeholder } from "../src/extensions";
import { createEditor } from "../src/js";
import { defineExtension } from "../src/types/extension";

describe("extension lifecycle", () => {
  it("initializes configured plugins once and publishes owned placeholder decorations across editing and undo", async () => {
    const editor = await createEditor({
      extensions: [Paragraph, Placeholder.configure({ text: "Write a draft" })],
    });
    expect(editor.getDecorations()).toMatchObject([{ type: "placeholder", text: "Write a draft" }]);
    editor.chain().insertText("😀").run();
    expect(editor.getDecorations()).toEqual([]);
    editor.undo();
    expect(editor.getDecorations()).toHaveLength(1);
    editor.setContent("existing");
    expect(editor.getDecorations()).toEqual([]);
    editor.destroy();
  });
  it("passes committed state to apply, calls hooks, and isolates callback failures during cleanup", async () => {
    const order: string[] = [];
    const callback = () => "configured";
    const seen = vi.fn();
    const apply = vi.fn((_, state) => {
      seen(state.doc.blocks[0].content);
      state.doc.blocks.length = 0;
    });
    const first = defineExtension({
      name: "first",
      options: { callback },
      plugin: (options) => {
        expect(options).toEqual({ callback });
        return {
          init: () => order.push("init"),
          apply,
          destroy: () => {
            order.push("plugin destroy");
            throw new Error("dispose failed");
          },
        };
      },
      onCreate: () => order.push("create"),
      onUpdate: () => order.push("update"),
      onDestroy: () => order.push("extension destroy"),
    });
    const second = defineExtension({
      name: "second",
      onDestroy: () => order.push("second destroy"),
    });
    const error = vi.fn();
    const editor = await createEditor({
      extensions: [Paragraph, first, second],
      host: { onError: error },
    });
    expect(order).toEqual(["init", "create"]);
    editor.chain().insertText("content").run();
    expect(apply).toHaveBeenCalledOnce();
    expect(seen).toHaveBeenCalledWith([{ text: "content", marks: [] }]);
    expect(editor.getText()).toBe("content");
    expect(order).toEqual(["init", "create", "update"]);
    editor.destroy();
    editor.destroy();
    expect(order.slice(-3)).toEqual(["second destroy", "plugin destroy", "extension destroy"]);
    expect(error).toHaveBeenCalledOnce();
    expect(editor.isDestroyed).toBe(true);
  });
  it("cleans initialized extensions when a later plugin fails during construction", async () => {
    const destroy = vi.fn();
    const first = defineExtension({ name: "first", plugin: () => ({ destroy }) });
    const second = defineExtension({
      name: "second",
      plugin: () => {
        throw new Error("initialization failed");
      },
    });
    await expect(createEditor({ extensions: [Paragraph, first, second] })).rejects.toThrow(
      "initialization failed",
    );
    expect(destroy).toHaveBeenCalledOnce();
  });
});
