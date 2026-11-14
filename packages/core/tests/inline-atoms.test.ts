import { afterEach, describe, expect, it } from "vitest";
import { atomRanges, expandRange, nearestEdge, snapOffset } from "../src/engine/atoms";
import { fallbackApply } from "../src/engine/js-transactions";
import { markGroups } from "../src/engine/mark-rules";
import { CustomEmoji, InlineImage, InlineMath, Mention } from "../src/extensions/atoms";
import { MinimalPreset } from "../src/presets";
import type { TextSpan } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import type { Step } from "../src/types/state";
import { ENGINES, type Engine, createOn, doc, mountForTyping, paragraph } from "./engines";

const ATOMS = [Mention, InlineMath, CustomEmoji, InlineImage];
const anna = { type: "mention", attrs: { id: "42", label: "Анна😀", kind: "user" } };
/** "Привет " + the mention "@Анна😀" (7..14) + " и всё". */
const spans = (): TextSpan[] => [
  { text: "Привет ", marks: [] },
  { text: "@Анна😀", marks: [anna] },
  { text: " и всё", marks: [] },
];

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.innerHTML = "";
});
async function open(engine: Engine, content: TextSpan[] = spans()) {
  const editor = await createOn(engine, {
    extensions: [...MinimalPreset, ...ATOMS],
    content: doc(paragraph("p", content)),
  });
  editors.push(editor);
  return editor;
}
const content = (editor: GoTipeEditor) => editor.getJSON().blocks[0]!.content;
const caret = (editor: GoTipeEditor) => editor.getViewState().selection.head.offset;
const at = (editor: GoTipeEditor, offset: number) =>
  editor.setSelection({ anchor: { blockId: "p", offset }, head: { blockId: "p", offset } });

describe("atom ranges", () => {
  const isAtomic = (type: string) => type === "mention";
  it("joins spans with equal atomic marks and keeps keyed neighbours apart", () => {
    const bold = { type: "bold", attrs: {} };
    const runs = atomRanges(
      [
        { text: "@А", marks: [anna] },
        { text: "нна😀", marks: [bold, anna] },
        { text: "@Анна😀", marks: [{ ...anna, attrs: { ...anna.attrs, key: "2" } }] },
        { text: " ", marks: [] },
      ],
      isAtomic,
    );
    expect(runs.map(({ from, to }) => [from, to])).toEqual([
      [0, 7],
      [7, 14],
    ]);
  });
  it("snaps by direction and expands partial ranges", () => {
    const atoms = [{ from: 7, to: 14, marks: [] }];
    expect(snapOffset(atoms, 8, 7)).toBe(14);
    expect(snapOffset(atoms, 13, 14)).toBe(7);
    expect(snapOffset(atoms, 9, null)).toBe(7);
    expect(nearestEdge(atoms, 10)).toBe(7);
    expect(nearestEdge(atoms, 11)).toBe(14);
    expect(expandRange(atoms, 13, 14)).toEqual({ from: 7, to: 14 });
    expect(expandRange(atoms, 3, 8)).toEqual({ from: 3, to: 14 });
    expect(expandRange(atoms, 3, 7)).toEqual({ from: 3, to: 7 });
    expect(expandRange(atoms, 10, 10)).toEqual({ from: 10, to: 10 });
  });
  it("leaves every step untouched when no mark is atomic", () => {
    const docJson = JSON.stringify({
      version: 1,
      blocks: [
        {
          id: "p",
          block_type: "paragraph",
          attrs: {},
          content: {
            type: "RichText",
            value: spans().map((s) => ({
              text: s.text,
              marks: s.marks.map((m) => ({ mark_type: m.type, attrs: m.attrs })),
            })),
          },
          children: [],
        },
      ],
    });
    const tr = JSON.stringify({ steps: [{ DeleteText: { block_id: "p", from: 13, to: 14 } }] });
    const plain = markGroups({ marks: { mention: {} } });
    const atomic = markGroups({ marks: { mention: { atomic: true } } });
    expect(() => fallbackApply(docJson, tr, undefined, plain)).toThrow(/splits a Unicode/);
    const after = JSON.parse(fallbackApply(docJson, tr, undefined, atomic));
    expect(after.blocks[0].content.value.map((s: TextSpan) => s.text).join("")).toBe(
      "Привет  и всё",
    );
  });
});

describe.each(ENGINES)("inline atoms on the %s engine", (engine) => {
  it("flags atomic marks in the view and keeps the caret off atoms", async () => {
    const editor = await open(engine);
    const view = editor.getViewState().blocks[0]!.content as { marks: { atomic?: true }[] }[];
    expect(view[1]!.marks[0]!.atomic).toBe(true);
    expect(view[0]!.marks).toEqual([]);
    at(editor, 7);
    at(editor, 8); // a step right from the start goes over the atom
    expect(caret(editor)).toBe(14);
    at(editor, 13); // a step left from the end goes back over it
    expect(caret(editor)).toBe(7);
    at(editor, 2);
    editor.setSelection({
      anchor: { blockId: "p", offset: 2 },
      head: { blockId: "p", offset: 10 },
    });
    expect(editor.getViewState().selection.head.offset).toBe(14);
    // An offset inside the emoji's surrogate pair inside the atom is an atom edge too.
    at(editor, 20);
    at(editor, 13);
    expect(caret(editor)).toBe(7);
  });

  it("deletes, formats and splits whole atoms, and undo restores one unit", async () => {
    const editor = await open(engine);
    const original = content(editor);
    // Backspace at the end removes one UTF-16 unit — inside the surrogate pair — and the atom.
    editor.dispatch({ steps: [{ type: "deleteText", blockId: "p", from: 13, to: 14 }] });
    expect(content(editor)).toEqual([{ text: "Привет  и всё", marks: [] }]);
    expect(editor.undo()).toBe(true);
    expect(content(editor)).toEqual(original);
    // A range ending inside the atom grows to its end.
    editor.dispatch({ steps: [{ type: "deleteText", blockId: "p", from: 3, to: 9 }] });
    expect(content(editor)).toEqual([{ text: "При и всё", marks: [] }]);
    editor.undo();
    editor.dispatch({
      steps: [{ type: "addMark", blockId: "p", from: 0, to: 9, mark: { type: "bold", attrs: {} } }],
    });
    expect(content(editor)).toEqual([
      { text: "Привет ", marks: [{ type: "bold", attrs: {} }] },
      { text: "@Анна😀", marks: [anna, { type: "bold", attrs: {} }] },
      { text: " и всё", marks: [] },
    ]);
    editor.undo();
    editor.dispatch({
      steps: [{ type: "removeMark", blockId: "p", from: 9, to: 10, markType: "mention" }],
    });
    expect(content(editor)).toEqual([{ text: "Привет @Анна😀 и всё", marks: [] }]);
    editor.undo();
    editor.dispatch({ steps: [{ type: "splitBlock", blockId: "p", offset: 9 }] });
    expect(editor.getJSON().blocks.map((b) => b.content)).toEqual([
      [{ text: "Привет ", marks: [] }],
      [
        { text: "@Анна😀", marks: [anna] },
        { text: " и всё", marks: [] },
      ],
    ]);
    editor.undo();
    expect(content(editor)).toEqual(original);
  });

  it("inserts text inside an atom at its nearer edge without the atomic mark", async () => {
    const editor = await open(engine);
    const insert = (offset: number, text: string): Step => ({
      type: "insertText",
      blockId: "p",
      offset,
      text,
      marks: [anna],
    });
    // A programmatic insertion inside keeps its own marks, but lands at the edge.
    editor.dispatch({ steps: [insert(12, "!")] });
    expect(content(editor)).toEqual([
      { text: "Привет ", marks: [] },
      { text: "@Анна😀!", marks: [anna] },
      { text: " и всё", marks: [] },
    ]);
  });

  it("types beside an atom without extending it", async () => {
    const editor = await open(engine);
    const typing = mountForTyping(editor);
    typing.caret("p", 14);
    typing.type("ё😀");
    typing.caret("p", 7);
    typing.type("Ж");
    expect(content(editor)).toEqual([
      { text: "Привет Ж", marks: [] },
      { text: "@Анна😀", marks: [anna] },
      { text: "ё😀 и всё", marks: [] },
    ]);
  });

  it("removes a whole atom with Backspace and restores it with one undo", async () => {
    const editor = await open(engine);
    const typing = mountForTyping(editor);
    typing.caret("p", 14);
    typing.element.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteContentBackward",
      }),
    );
    expect(content(editor)).toEqual([{ text: "Привет  и всё", marks: [] }]);
    expect(caret(editor)).toBe(7);
    expect(editor.undo()).toBe(true);
    expect(content(editor)).toEqual(spans());
  });

  it("never starts a composition inside an atom", async () => {
    const editor = await open(engine);
    const typing = mountForTyping(editor);
    const text = typing.element.querySelector('[data-block-id="p"]')!.firstChild!;
    // A click puts the DOM caret inside the atom's text (and cancels pending restores);
    // coming from the block start, the caret moves on to the atom's end.
    document.dispatchEvent(new Event("pointerdown"));
    document.getSelection()!.collapse(text, 9);
    typing.element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    // The browser composes where its own caret is: inside the atom's text.
    (text as Text).insertData(9, "漢");
    typing.element.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "漢" }),
    );
    expect(content(editor)).toEqual([
      { text: "Привет ", marks: [] },
      { text: "@Анна😀", marks: [anna] },
      { text: "漢 и всё", marks: [] },
    ]);
    expect(caret(editor)).toBe(15);
  });

  it("selects a whole atom for a range within it, in its direction", async () => {
    const editor = await open(engine);
    const range = (anchor: number, head: number) =>
      editor.setSelection({
        anchor: { blockId: "p", offset: anchor },
        head: { blockId: "p", offset: head },
      });
    const points = () => {
      const { anchor, head } = editor.getViewState().selection;
      return [anchor.offset, head.offset];
    };
    range(8, 10); // a double click on a word of the atom
    expect(points()).toEqual([7, 14]);
    range(13, 7); // a drag from the end backwards to the start
    expect(points()).toEqual([14, 7]);
  });

  it("never stores an atomic mark for the next typed text", async () => {
    const editor = await open(engine);
    at(editor, 2);
    editor.dispatch({
      steps: [{ type: "addMark", blockId: "p", from: 2, to: 2, mark: anna }],
    });
    editor.dispatch({
      steps: [{ type: "addMark", blockId: "p", from: 2, to: 2, mark: { type: "bold", attrs: {} } }],
    });
    expect(editor.getViewState().toolbar.activeMarks).toEqual(["bold"]);
    const typing = mountForTyping(editor);
    typing.type("ж");
    expect(content(editor)[0]).toEqual({ text: "Пр", marks: [] });
    expect(content(editor)[1]).toEqual({ text: "ж", marks: [{ type: "bold", attrs: {} }] });
  });
});

describe("JS and WASM engines agree on atoms", () => {
  it("produce the same documents for the same steps", async () => {
    const keyed = { ...anna, attrs: { ...anna.attrs, key: "2" } };
    const start: TextSpan[] = [
      { text: "а", marks: [] },
      { text: "@Анна😀", marks: [anna] },
      { text: "@Анна😀", marks: [keyed] },
      { text: "$x$", marks: [{ type: "inlineMath", attrs: {} }] },
    ];
    const scripts: Step[][] = [
      [{ type: "deleteText", blockId: "p", from: 8, to: 9 }],
      [{ type: "deleteText", blockId: "p", from: 7, to: 8 }],
      [{ type: "addMark", blockId: "p", from: 6, to: 10, mark: { type: "bold", attrs: {} } }],
      [{ type: "insertText", blockId: "p", offset: 16, text: "ё", marks: [] }],
      [{ type: "removeMark", blockId: "p", from: 2, to: 3, markType: "mention" }],
      [{ type: "deleteText", blockId: "p", from: 0, to: 2 }],
    ];
    const results: Record<string, unknown[]> = {};
    for (const engine of ENGINES) {
      const editor = await open(engine, start);
      results[engine] = scripts.map((steps) => {
        editor.dispatch({ steps });
        const after = content(editor);
        editor.undo();
        return after;
      });
    }
    expect(results.wasm).toEqual(results.js);
    expect(results.js![0]).toEqual([
      { text: "а", marks: [] },
      { text: "@Анна😀", marks: [anna] },
      { text: "$x$", marks: [{ type: "inlineMath", attrs: {} }] },
    ]);
  });
});
