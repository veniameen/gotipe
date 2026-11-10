import { afterEach, describe, expect, it, vi } from "vitest";
import { Image, Paragraph } from "../src/extensions";
import { createEditor } from "../src/js";
import type { GoTipeEditor } from "../src/types/editor";
import { type Extension, defineExtension } from "../src/types/extension";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const clean of cleanups.splice(0)) clean();
});
async function setup(extensions: Extension[]) {
  const errors = vi.fn();
  const editor = await createEditor({
    extensions: [Paragraph, ...extensions],
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
    host: { onError: errors },
  });
  const root = document.createElement("div");
  root.innerHTML = '<p data-block-id="p" data-block-type="paragraph">base</p>';
  document.body.append(root);
  editor.mount(root);
  editor.setSelection({ anchor: { blockId: "p", offset: 4 }, head: { blockId: "p", offset: 4 } });
  cleanups.push(() => {
    editor.destroy();
    root.remove();
  });
  const paste = (text = "", files: File[] = []) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files, getData: (type: string) => (type === "text/plain" ? text : "") },
    });
    root.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  };
  return { editor, paste, errors, root };
}
function asyncValue<T>() {
  let finish!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}
describe("configured extension paste rules", () => {
  it("runs an async configured text rule on one isolated draft and commits one undo boundary", async () => {
    const onCreate = vi.fn();
    const rule = defineExtension({
      name: "paste",
      options: { suffix: "😀" },
      onCreate,
      pasteRules: [
        {
          match: /^convert:/g,
          handler: async (draft, data, configured) => {
            const suffix = (configured as { suffix: string }).suffix;
            await Promise.resolve();
            draft.chain().insertText(String(data).slice(8)).run();
            draft.chain().insertText(suffix).run();
          },
        },
      ],
    });
    const { editor, paste, errors } = await setup([rule]);
    paste("convert:Ж");
    await vi.waitFor(() => expect(editor.getText()).toBe("baseЖ😀"));
    expect(errors).not.toHaveBeenCalled();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("base");
    expect(editor.undo()).toBe(false);
    paste("convert:Я");
    await vi.waitFor(() => expect(editor.getText()).toBe("baseЯ😀"));
    expect(onCreate).toHaveBeenCalledOnce();
  });
  it("does not commit partial handler work or fall back to plain text after a rule error", async () => {
    const rule = defineExtension({
      name: "fail",
      pasteRules: [
        {
          match: /handled/,
          handler: async (draft) => {
            draft.chain().insertText("partial").run();
            throw new Error("upload failed");
          },
        },
      ],
    });
    const { editor, paste, errors } = await setup([rule]);
    paste("handled");
    await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce());
    expect(editor.getText()).toBe("base");
    expect(editor.undo()).toBe(false);
    paste("unmatched");
    expect(editor.getText()).toBe("baseunmatched");
  });
  it("cancels stale and destroyed async drafts without mutating a newer selection", async () => {
    const ready = asyncValue<void>();
    let captured: GoTipeEditor | undefined;
    const rule = defineExtension({
      name: "late",
      pasteRules: [
        {
          match: /late/,
          handler: async (draft) => {
            captured = draft;
            await ready.promise;
            draft.chain().insertText("late").run();
          },
        },
      ],
    });
    const { editor, paste, errors } = await setup([rule]);
    paste("late");
    await vi.waitFor(() => expect(captured).toBeDefined());
    editor.setSelection({ anchor: { blockId: "p", offset: 0 }, head: { blockId: "p", offset: 0 } });
    ready.finish();
    await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce());
    expect(editor.getText()).toBe("base");
    expect(captured!.isDestroyed).toBe(true);
  });
  it("enforces configured image limits and upload, preserving atomic multi-file insertion", async () => {
    const upload = vi.fn(async (file: File) => `assets/${file.name}`);
    const { editor, paste, errors } = await setup([
      Image.configure({ maxSize: 5, allowedTypes: ["image/png"], upload }),
    ]);
    paste("", [
      new File(["x"], "one.png", { type: "image/png" }),
      new File(["x"], "two.png", { type: "image/png" }),
    ]);
    await vi.waitFor(() =>
      expect(editor.getJSON().blocks.filter((block) => block.type === "image")).toHaveLength(2),
    );
    expect(
      editor
        .getJSON()
        .blocks.filter((block) => block.type === "image")
        .map((block) => block.attrs.src),
    ).toEqual(["assets/one.png", "assets/two.png"]);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(errors).not.toHaveBeenCalled();
    editor.undo();
    expect(editor.getText()).toBe("base");
    expect(editor.undo()).toBe(false);
    paste("", [new File(["abcdef"], "large.png", { type: "image/png" })]);
    await vi.waitFor(() => expect(errors).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledTimes(2);
    paste("", [
      new File(["x"], "first.png", { type: "image/png" }),
      new File(["x"], "forbidden.jpg", { type: "image/jpeg" }),
    ]);
    await vi.waitFor(() => expect(errors).toHaveBeenCalledTimes(2));
    expect(editor.getJSON().blocks).toHaveLength(1);
    expect(editor.undo()).toBe(false);
  });
  it("destroys a pending draft when its mounted owner is removed", async () => {
    const ready = asyncValue<void>();
    let captured: GoTipeEditor | undefined;
    const { editor, paste, errors } = await setup([
      defineExtension({
        name: "pending",
        pasteRules: [
          {
            match: /later/,
            handler: async (draft) => {
              captured = draft;
              await ready.promise;
              draft.dispatch({
                steps: [{ type: "insertText", blockId: "p", offset: 4, text: "late", marks: [] }],
              });
            },
          },
        ],
      }),
    ]);
    paste("later");
    await vi.waitFor(() => expect(captured).toBeDefined());
    editor.unmount();
    expect(captured!.isDestroyed).toBe(true);
    ready.finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(editor.getText()).toBe("base");
    expect(errors).not.toHaveBeenCalled();
  });
});
