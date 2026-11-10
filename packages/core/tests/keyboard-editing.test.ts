import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { createEditorWithLoader } from "../src/editor";
import { FullPreset } from "../src/presets";
import type { Block, Document, Mark } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";

const text = (id: string, value: string, marks: Mark[] = [], type = "paragraph"): Block => ({
  id,
  type,
  attrs: {},
  content: [{ text: value, marks }],
  children: [],
});
const active: { editor: GoTipeEditor; element: HTMLElement }[] = [];
afterEach(() => {
  for (const { editor, element } of active.splice(0)) {
    editor.destroy();
    element.remove();
  }
});

beforeAll(() => {
  wasm.initSync({
    module: readFileSync(resolve(process.cwd(), "../wasm/pkg/gotipe_wasm_bg.wasm")),
  });
});

async function mountEditor(blocks: Block[], engine: "js" | "wasm") {
  const errors: unknown[] = [];
  const editor = await createEditorWithLoader(
    {
      engine,
      extensions: FullPreset,
      content: { version: 1, blocks },
      host: { onError: (error) => errors.push(error) },
    },
    engine === "wasm" ? async () => wasm : null,
  );
  const element = document.createElement("div");
  const render = (block: Block): HTMLElement => {
    const node = document.createElement("div");
    node.dataset.blockId = block.id;
    node.dataset.blockType = block.type;
    node.append(
      Array.isArray(block.content)
        ? block.content.map((span) => span.text).join("")
        : (block.content ?? ""),
    );
    for (const child of block.children) node.append(render(child));
    return node;
  };
  element.append(...blocks.map(render));
  document.body.append(element);
  editor.mount(element);
  active.push({ editor, element });
  return {
    editor,
    errors,
    input(inputType: string, data: string | null = null) {
      const event = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType,
        data,
      });
      element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(errors).toEqual([]);
    },
    doc: () => editor.getJSON() as Document,
  };
}

describe.each(["js", "wasm"] as const)("%s keyboard document integrity", (engine) => {
  const setup = (blocks: Block[]) => mountEditor(blocks, engine);
  it.each([
    ["paragraph", "insertParagraph"],
    ["paragraph", "insertLineBreak"],
    ["blockquote", "insertParagraph"],
    ["blockquote", "insertLineBreak"],
    ["callout", "insertParagraph"],
    ["callout", "insertLineBreak"],
  ] as const)(
    "Shift+Enter keeps a %s intact when the browser reports %s",
    async (type, inputType) => {
      const bold: Mark = { type: "bold", attrs: {} };
      const original = text("a", "Ж😀尾", [bold], type);
      const { editor, input, doc } = await setup([original]);
      editor.setSelection({
        anchor: { blockId: "a", offset: 3 },
        head: { blockId: "a", offset: 3 },
      });
      editor.element!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      input(inputType);
      expect(doc().blocks).toEqual([
        { ...original, content: [{ text: "Ж😀\n尾", marks: [bold] }] },
      ]);
      expect(editor.getViewState().selection.anchor).toEqual({ blockId: "a", offset: 4 });
      expect(editor.undo()).toBe(true);
      expect(doc().blocks).toEqual([original]);
      expect(editor.undo()).toBe(false);
      // The consumed Shift intent cannot leak into a later plain Enter.
      input("insertParagraph");
      expect(doc().blocks).toHaveLength(2);
    },
  );

  it("reads detached native selection without invalidating the view, model or subscriptions", async () => {
    const { editor, errors, doc } = await setup([text("a", "Ж😀尾"), text("b", "Z😀")]);
    const root = editor.element!;
    const native = document.getSelection()!;
    const a = root.querySelector('[data-block-id="a"]')!.firstChild!;
    const b = root.querySelector('[data-block-id="b"]')!.firstChild!;
    const view = editor.getViewState();
    const before = doc();
    const events: string[] = [];
    editor.on("viewStateChange", () => events.push("view"));
    editor.on("selectionChange", () => events.push("selection"));
    editor.on("update", () => events.push("update"));
    native.setBaseAndExtent(b, 3, a, 1);
    const expected = { anchor: { blockId: "b", offset: 3 }, head: { blockId: "a", offset: 1 } };
    const selection = editor.getDOMSelection()!;
    expect(selection).toEqual(expected);
    selection.anchor.offset = 999;
    selection.head.blockId = "changed";
    expect(editor.getDOMSelection()).toEqual(expected);
    expect(editor.getViewState()).toBe(view);
    expect(doc()).toEqual(before);
    expect(events).toEqual([]);
    expect(errors).toEqual([]);
    expect(native.anchorNode).toBe(b);
    expect(native.focusOffset).toBe(1);

    const widget = document.createElement("span");
    widget.dataset.gotipeWidget = "";
    widget.textContent = "Independent";
    root.append(widget);
    native.setBaseAndExtent(widget.firstChild!, 0, widget.firstChild!, 1);
    expect(editor.getDOMSelection()).toBeNull();
    native.removeAllRanges();
    expect(editor.getDOMSelection()).toBeNull();
    native.setBaseAndExtent(a, 0, a, 0);
    editor.unmount();
    expect(editor.getDOMSelection()).toBeNull();
    editor.destroy();
    expect(editor.getDOMSelection()).toBeNull();
  });

  it("replaces a range across paragraphs once, inheriting complete marks and restoring it with undo", async () => {
    const link: Mark = { type: "link", attrs: { href: "https://example.test" } };
    const { editor, input, doc } = await setup([text("a", "abc", [link]), text("b", "def")]);
    const selection = { anchor: { blockId: "a", offset: 1 }, head: { blockId: "b", offset: 2 } };
    editor.setSelection(selection);
    input("insertText", "X");
    expect(editor.getText()).toBe("aXf");
    expect(doc().blocks).toHaveLength(1);
    expect(doc().blocks[0]!.content).toEqual([
      { text: "aX", marks: [link] },
      { text: "f", marks: [] },
    ]);
    editor.undo();
    expect(editor.getText()).toBe("abc\ndef");
    expect(editor.getViewState().selection).toEqual({ type: "text", ...selection });
    expect(editor.undo()).toBe(false);
  });

  it.each(["deleteContentBackward", "deleteContentForward"])(
    "%s removes a reverse cross-block range",
    async (kind) => {
      const { editor, input } = await setup([text("a", "abc"), text("b", "def")]);
      editor.setSelection({
        anchor: { blockId: "b", offset: 2 },
        head: { blockId: "a", offset: 1 },
      });
      input(kind);
      expect(editor.getText()).toBe("af");
      expect(editor.getViewState().selection.anchor).toEqual({ blockId: "a", offset: 1 });
      editor.undo();
      expect(editor.getText()).toBe("abc\ndef");
    },
  );

  it("Enter replaces a cross-block range and splits the remaining text in one undo item", async () => {
    const { editor, input, doc } = await setup([text("a", "abc"), text("b", "def")]);
    editor.setSelection({ anchor: { blockId: "a", offset: 1 }, head: { blockId: "b", offset: 2 } });
    input("insertParagraph");
    expect(editor.getText()).toBe("a\nf");
    expect(doc().blocks).toHaveLength(2);
    editor.undo();
    expect(editor.getText()).toBe("abc\ndef");
    expect(editor.undo()).toBe(false);
  });

  it("Enter exits a styled paragraph atomically", async () => {
    const { editor, input, doc } = await setup([text("a", "abcd", [], "callout")]);
    editor.setSelection({ anchor: { blockId: "a", offset: 2 }, head: { blockId: "a", offset: 2 } });
    input("insertParagraph");
    expect(doc().blocks.map((block) => block.type)).toEqual(["callout", "paragraph"]);
    expect(editor.getText()).toBe("ab\ncd");
    editor.undo();
    expect(doc().blocks).toEqual([text("a", "abcd", [], "callout")]);
    expect(editor.undo()).toBe(false);
  });

  it("forward delete joins paragraphs without losing marks", async () => {
    const bold: Mark = { type: "bold", attrs: {} };
    const { editor, input, doc } = await setup([text("a", "ab"), text("b", "cd", [bold])]);
    editor.setSelection({ anchor: { blockId: "a", offset: 2 }, head: { blockId: "a", offset: 2 } });
    input("deleteContentForward");
    expect(editor.getText()).toBe("abcd");
    expect(doc().blocks[0]!.content).toEqual([
      { text: "ab", marks: [] },
      { text: "cd", marks: [bold] },
    ]);
    expect(editor.getViewState().selection.anchor.offset).toBe(2);
  });

  it("word deletion removes the whole word while preserving following Unicode", async () => {
    const { editor, input } = await setup([text("a", "one two 😀")]);
    editor.setSelection({ anchor: { blockId: "a", offset: 7 }, head: { blockId: "a", offset: 7 } });
    input("deleteWordBackward");
    expect(editor.getText()).toBe("one  😀");
    expect(editor.getViewState().selection.anchor.offset).toBe(4);
  });

  it("exits a middle empty list item without moving subsequent rows before the caret", async () => {
    const list: Block = {
      id: "list",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [
        text("a", "first", [], "listItem"),
        text("b", "", [], "listItem"),
        text("c", "last", [], "listItem"),
      ],
    };
    const { editor, input, doc } = await setup([list]);
    editor.setSelection({ anchor: { blockId: "b", offset: 0 }, head: { blockId: "b", offset: 0 } });
    input("insertParagraph");
    expect(doc().blocks.map((block) => block.type)).toEqual([
      "bulletList",
      "paragraph",
      "bulletList",
    ]);
    expect(doc().blocks[0]!.children.map((block) => block.id)).toEqual(["a"]);
    expect(doc().blocks[2]!.children.map((block) => block.id)).toEqual(["c"]);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "b", offset: 0 });
    editor.undo();
    expect(doc().blocks).toEqual([list]);
  });
});
