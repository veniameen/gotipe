import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { createEditorWithLoader } from "../src/editor";
import { DefaultPreset, FullPreset } from "../src/presets";
import type { Block, Mark, TextSpan } from "../src/types/block";
import { type Extension, defineExtension } from "../src/types/extension";
import type { GoTipeEditor } from "../src/types/editor";

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

const mark = (type: string): Mark => ({ type, attrs: {} });
const paragraph = (id: string, content: TextSpan[], type = "paragraph"): Block => ({
  id,
  type,
  attrs: {},
  content,
  children: [],
});

/** Mounts the editor on a plain DOM copy of the text and types through `beforeinput`. */
async function typing(
  engine: "js" | "wasm",
  content: TextSpan[],
  caret: number,
  extensions: Extension[] = FullPreset,
) {
  const errors: unknown[] = [];
  const editor = await createEditorWithLoader(
    {
      engine,
      extensions,
      content: { version: 1, blocks: [paragraph("p", content)] },
      host: { onError: (error) => errors.push(error) },
    },
    engine === "wasm" ? async () => wasm : null,
  );
  const element = document.createElement("div");
  const node = document.createElement("div");
  node.dataset.blockId = "p";
  node.dataset.blockType = "paragraph";
  node.append(content.map((span) => span.text).join(""));
  element.append(node);
  document.body.append(element);
  editor.mount(element);
  active.push({ editor, element });
  editor.setSelection({
    anchor: { blockId: "p", offset: caret },
    head: { blockId: "p", offset: caret },
  });
  return {
    editor,
    type(data: string) {
      const event = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data,
      });
      element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(errors).toEqual([]);
    },
    content: () => editor.getJSON().blocks[0]!.content,
  };
}

describe.each(["js", "wasm"] as const)("%s inline Markdown input rules (D-06)", (engine) => {
  it.each([
    ["**", "bold"],
    ["*", "italic"],
    ["~~", "strikethrough"],
    ["`", "code"],
  ])("%s text %s typed before the caret becomes formatted text", async (delimiter, type) => {
    const typed = `Скажи ${delimiter}жир😀${delimiter.slice(0, -1)}`;
    const {
      editor,
      type: input,
      content,
    } = await typing(engine, [{ text: typed, marks: [] }], typed.length);
    input(delimiter.at(-1)!);
    expect(content()).toEqual([
      { text: "Скажи ", marks: [] },
      { text: "жир😀", marks: [mark(type)] },
    ]);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 11 });
    // The caret leaves the run: what is typed next is not formatted.
    expect(editor.getViewState().toolbar.activeMarks).not.toContain(type);
    input("!");
    expect(content()).toEqual([
      { text: "Скажи ", marks: [] },
      { text: "жир😀", marks: [mark(type)] },
      { text: "!", marks: [] },
    ]);
    editor.undo();
    editor.undo();
    expect(content()).toEqual([{ text: `Скажи ${delimiter}жир😀${delimiter}`, marks: [] }]);
    expect(editor.getViewState().selection.anchor.offset).toBe(typed.length + 1);
  });

  it("converts at the caret in the middle of a block", async () => {
    const { type: input, content } = await typing(engine, [{ text: "a **b* c", marks: [] }], 6);
    input("*");
    expect(content()).toEqual([
      { text: "a ", marks: [] },
      { text: "b", marks: [mark("bold")] },
      { text: " c", marks: [] },
    ]);
  });

  it.each([
    ["2*3", 3, "2*3*"],
    ["слово*курсив", 12, "слово*курсив*"],
    ["* a", 3, "* a*"],
    ["**жир **", 8, "**жир ***"],
  ])("leaves %s plus a delimiter as text", async (text, caret, result) => {
    const { editor, type: input, content } = await typing(engine, [{ text, marks: [] }], caret);
    input("*");
    expect(content()).toEqual([{ text: result, marks: [] }]);
    // Nothing is switched on for the next typed text either.
    expect(editor.getViewState().toolbar.activeMarks).toEqual([]);
  });

  it("ignores a closed run that does not end at the caret", async () => {
    const {
      editor,
      type: input,
      content,
    } = await typing(engine, [{ text: " **b**", marks: [] }], 0);
    input("x");
    expect(content()).toEqual([{ text: "x **b**", marks: [] }]);
    expect(editor.getViewState().toolbar.activeMarks).toEqual([]);
  });

  it("keeps the marks the text already had", async () => {
    const link = { type: "link", attrs: { href: "https://example.test" } };
    const { type: input, content } = await typing(
      engine,
      [
        { text: "*", marks: [] },
        { text: "ссылка", marks: [link] },
      ],
      7,
    );
    input("*");
    expect(content()).toEqual([{ text: "ссылка", marks: [link, mark("italic")] }]);
  });

  it("lets later rules try when a transaction filter cancels the conversion", async () => {
    let later = 0;
    const recorder = defineExtension({
      name: "recorder",
      inputRules: [
        {
          pattern: /\*\*$/,
          handler: () => {
            later += 1;
          },
        },
      ],
    });
    const {
      editor,
      type: input,
      content,
    } = await typing(engine, [{ text: "**b*", marks: [] }], 4, [...FullPreset, recorder]);
    editor.addTransactionFilter(
      ({ transaction }) => !transaction.steps.some((step) => step.type === "addMark"),
    );
    input("*");
    expect(content()).toEqual([{ text: "**b**", marks: [] }]);
    expect(later).toBe(1);
    expect(editor.getViewState().toolbar.activeMarks).toEqual([]);
  });

  it("``` and a space make a plain code block; a typed language is kept", async () => {
    const plain = await typing(engine, [{ text: "```", marks: [] }], 3);
    plain.type(" ");
    expect(plain.editor.getJSON().blocks[0]).toMatchObject({
      type: "codeBlock",
      attrs: { language: "" },
    });
    expect(plain.editor.getMarkdown()).toBe("```\n```\n");
    const typed = await typing(engine, [{ text: "```ts", marks: [] }], 5);
    typed.type(" ");
    expect(typed.editor.getJSON().blocks[0]).toMatchObject({
      type: "codeBlock",
      attrs: { language: "ts" },
    });
  });

  it("reads <pre><code> without a language as plain text and writes it back bare", async () => {
    const { editor } = await typing(engine, [{ text: "x", marks: [] }], 0);
    editor.setContent("<pre><code>const a = 1;</code></pre>");
    expect(editor.getJSON().blocks[0]).toMatchObject({
      type: "codeBlock",
      attrs: { language: "" },
    });
    expect(editor.getHTML()).toBe("<pre><code>const a = 1;</code></pre>");
  });

  it("does not turn #### into a heading when the preset offers levels 1-3 (D-09)", async () => {
    const { editor, type: input } = await typing(
      engine,
      [{ text: "####", marks: [] }],
      4,
      DefaultPreset,
    );
    input(" ");
    expect(editor.getJSON().blocks[0]).toMatchObject({
      type: "paragraph",
      content: [{ text: "#### " }],
    });
    const level3 = await typing(engine, [{ text: "###", marks: [] }], 3, DefaultPreset);
    level3.type(" ");
    expect(level3.editor.getJSON().blocks[0]).toMatchObject({
      type: "heading",
      attrs: { level: 3 },
    });
  });
});

describe("inline input rules with collaboration history", () => {
  it("undoes the conversion alone, keeping the typed delimiter", async () => {
    const typed = "**Ж😀*";
    const {
      editor,
      type: input,
      content,
    } = await typing("wasm", [{ text: typed, marks: [] }], typed.length);
    editor.enableCollaboration("rule-peer");
    input("*");
    expect(content()).toEqual([{ text: "Ж😀", marks: [mark("bold")] }]);
    expect(editor.undo()).toBe(true);
    expect(content()).toEqual([{ text: "**Ж😀**", marks: [] }]);
    expect(editor.undo()).toBe(true);
    expect(content()).toEqual([{ text: typed, marks: [] }]);
  });
});
