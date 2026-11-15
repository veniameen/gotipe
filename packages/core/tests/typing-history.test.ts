import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Bold, Divider, Paragraph } from "../src/extensions";
import { Mention } from "../src/extensions/atoms";
import type { Block } from "../src/types/block";
import { ENGINES, block, createOn, doc, mountForTyping, paragraph } from "./engines";

const cleanups: (() => void)[] = [];
// Only the clock is fake: a pause moves Date.now(), timers and frames stay real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
});
const pause = (ms: number) => vi.setSystemTime(Date.now() + ms);

describe.each(ENGINES)("%s typing history", (engine) => {
  async function open(...blocks: Block[]) {
    const editor = await createOn(engine, {
      extensions: [Paragraph, Bold, Divider],
      content: doc(...blocks),
    });
    const surface = mountForTyping(editor);
    cleanups.push(() => surface.remove());
    const input = (inputType: string, data: string | null = null) => {
      const event = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType,
        data,
      });
      surface.element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    };
    const texts = () =>
      editor
        .getJSON()
        .blocks.map((block) =>
          Array.isArray(block.content) ? block.content.map((span) => span.text).join("") : "",
        );
    const undone = () => {
      expect(editor.undo()).toBe(true);
      return texts();
    };
    return { editor, surface, input, texts, undone };
  }

  it("undoes text typed in one go as one step, and redoes it", async () => {
    const { editor, surface, texts, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("Привет, мир 😀");
    expect(texts()).toEqual(["Привет, мир 😀"]);
    expect(undone()).toEqual([""]);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 0 });
    expect(editor.undo()).toBe(false);
    expect(editor.redo()).toBe(true);
    expect(texts()).toEqual(["Привет, мир 😀"]);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 14 });
    expect(editor.redo()).toBe(false);
  });

  it("undoes typing longer than the history limit in one step", async () => {
    const { editor, surface, undone } = await open(paragraph("p", "Ж"));
    surface.caret("p", 1);
    surface.type("я".repeat(150));
    expect(undone()).toEqual(["Ж"]);
    expect(editor.undo()).toBe(false);
  });

  it("a pause of 500 ms starts a new step, a shorter one does not", async () => {
    const { editor, surface, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("ab");
    pause(499);
    surface.type("cd");
    pause(500);
    surface.type("ef");
    expect(undone()).toEqual(["abcd"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("a caret move ends the step, also when the caret comes back", async () => {
    const { editor, surface, texts, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("abc");
    surface.caret("p", 1);
    surface.caret("p", 3);
    surface.type("d");
    surface.caret("p", 0);
    surface.type("Ж");
    expect(texts()).toEqual(["Жabcd"]);
    expect(undone()).toEqual(["abcd"]);
    expect(undone()).toEqual(["abc"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("the same caret set again keeps the step: a renderer restoring it splits nothing", async () => {
    const { editor, surface, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("ab");
    surface.caret("p", 2);
    surface.type("c");
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("typing in another block is another step", async () => {
    const { editor, surface, undone } = await open(paragraph("a", ""), paragraph("b", ""));
    surface.caret("a", 0);
    surface.type("12");
    surface.caret("b", 0);
    surface.type("34");
    expect(undone()).toEqual(["12", ""]);
    expect(undone()).toEqual(["", ""]);
    expect(editor.undo()).toBe(false);
  });

  it("Backspace after typing is a step of its own, Backspaces in a row are one", async () => {
    const { editor, surface, input, texts, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("abcd");
    input("deleteContentBackward");
    input("deleteContentBackward");
    expect(texts()).toEqual(["ab"]);
    surface.type("😀");
    expect(texts()).toEqual(["ab😀"]);
    expect(undone()).toEqual(["ab"]);
    expect(undone()).toEqual(["abcd"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("Delete and word deletion in a row are one step", async () => {
    const { editor, surface, input, texts, undone } = await open(paragraph("p", "один два три"));
    surface.caret("p", 4);
    input("deleteContentForward");
    input("deleteContentForward");
    input("deleteWordForward");
    expect(texts()).toEqual(["один три"]);
    expect(undone()).toEqual(["один два три"]);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 4 });
    expect(editor.undo()).toBe(false);
  });

  it("typing over a selection starts a step that the following typing joins", async () => {
    const { editor, surface, texts, undone } = await open(paragraph("p", "Hello world"));
    surface.caret("p", 11);
    surface.type("!");
    const selection = { anchor: { blockId: "p", offset: 6 }, head: { blockId: "p", offset: 11 } };
    editor.setSelection(selection);
    surface.type("there");
    expect(texts()).toEqual(["Hello there!"]);
    expect(undone()).toEqual(["Hello world!"]);
    expect(editor.getViewState().selection).toMatchObject(selection);
    expect(undone()).toEqual(["Hello world"]);
    expect(editor.undo()).toBe(false);
  });

  it("deleting a selection, also across blocks, starts a step the next Backspaces join", async () => {
    const { editor, input, texts, undone } = await open(
      paragraph("a", "hello"),
      paragraph("b", "world"),
    );
    const selection = { anchor: { blockId: "a", offset: 3 }, head: { blockId: "b", offset: 2 } };
    editor.setSelection(selection);
    input("deleteContentBackward");
    input("deleteContentBackward");
    input("deleteContentBackward");
    expect(texts()).toEqual(["hrld"]);
    expect(undone()).toEqual(["hello", "world"]);
    expect(editor.getViewState().selection).toMatchObject(selection);
    expect(editor.undo()).toBe(false);
  });

  it("a whole selected block deleted with Backspace is a step of its own", async () => {
    const { editor, input, texts } = await open(
      paragraph("a", "ab"),
      block("hr", "divider", null),
      paragraph("c", "cd"),
    );
    const original = editor.getJSON();
    editor.dispatch({ steps: [], selection: { type: "block", blockId: "hr" } });
    input("deleteContentBackward");
    const removed = editor.getJSON();
    expect(removed.blocks.map((item) => item.id)).toEqual(["a", "c"]);
    input("deleteContentForward");
    expect(texts()).toEqual(["ab", "d"]);
    expect(editor.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(removed);
    expect(editor.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    expect(editor.undo()).toBe(false);
  });

  it("a line break and Enter are steps of their own", async () => {
    const { editor, surface, input, texts, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("ab");
    surface.key("Enter", { shiftKey: true });
    input("insertLineBreak");
    surface.type("cd");
    surface.key("Enter");
    input("insertParagraph");
    surface.type("ef");
    expect(texts()).toEqual(["ab\ncd", "ef"]);
    expect(undone()).toEqual(["ab\ncd", ""]);
    expect(undone()).toEqual(["ab\ncd"]);
    expect(undone()).toEqual(["ab\n"]);
    expect(undone()).toEqual(["ab"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("a command between typing ends the step and stays one step", async () => {
    const { editor, surface, texts, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("ab");
    const insert = (offset: number, text: string) =>
      editor.dispatch({
        steps: [{ type: "insertText", blockId: "p", offset, text, marks: [] }],
        selection: { type: "cursor", blockId: "p", offset: offset + text.length },
      });
    insert(2, "X");
    insert(3, "Y");
    surface.type("cd");
    expect(texts()).toEqual(["abXYcd"]);
    expect(undone()).toEqual(["abXY"]);
    expect(undone()).toEqual(["abX"]);
    expect(undone()).toEqual(["ab"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("turning bold on between words ends the step", async () => {
    const { editor, surface, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("ab");
    expect(editor.chain().toggleBold().run()).toBe(true);
    surface.type("cd");
    expect(editor.getJSON().blocks[0]!.content).toEqual([
      { text: "ab", marks: [] },
      { text: "cd", marks: [{ type: "bold", attrs: {} }] },
    ]);
    expect(undone()).toEqual(["ab"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("a change with addToHistory: false adds no step and does not end the typing step", async () => {
    const { editor, surface, texts, undone } = await open(
      paragraph("p", ""),
      paragraph("q", "tail"),
    );
    const note = () =>
      editor.dispatch({
        steps: [{ type: "insertText", blockId: "q", offset: 4, text: "!", marks: [] }],
        metadata: { addToHistory: false },
      });
    note();
    expect(editor.undo()).toBe(false);
    surface.caret("p", 0);
    surface.type("ab");
    note();
    surface.type("cd");
    expect(texts()).toEqual(["abcd", "tail!!"]);
    // Undo restores the document from before its step: the unrecorded change after it goes too.
    expect(undone()).toEqual(["", "tail!"]);
    expect(editor.undo()).toBe(false);
  });

  it("a rejected character neither ends the step nor adds one", async () => {
    const { editor, surface, texts, undone } = await open(paragraph("p", ""));
    editor.addTransactionFilter(({ after }) => !JSON.stringify(after.blocks).includes("ы"));
    surface.caret("p", 0);
    surface.type("abыcd");
    expect(texts()).toEqual(["abcd"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("typing after Undo is a new step and clears Redo", async () => {
    const { editor, surface, texts, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("ab");
    expect(undone()).toEqual([""]);
    surface.type("cd");
    expect(texts()).toEqual(["cd"]);
    expect(editor.getViewState().toolbar.canRedo).toBe(false);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  /**
   * The browser composes `data` at the model caret: the renderer drew the model text, the IME
   * writes into the DOM between compositionstart and compositionend, `ms` after the start.
   */
  function compose(view: Awaited<ReturnType<typeof open>>, data: string, ms = 0) {
    const { editor, surface } = view;
    const { blockId, offset } = editor.getViewState().selection.anchor;
    const node = surface.element.querySelector(`[data-block-id="${blockId}"]`)!;
    const block = editor.getJSON().blocks.find((item) => item.id === blockId)!;
    const value = Array.isArray(block.content)
      ? block.content.map((span) => span.text).join("")
      : "";
    node.textContent = value;
    surface.caret(blockId, offset);
    surface.element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    pause(ms);
    node.textContent = value.slice(0, offset) + data + value.slice(offset);
    surface.element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data }));
  }

  it("an IME composition goes on with the typing step, and typing goes on after it (D-131)", async () => {
    const view = await open(paragraph("p", ""));
    const { editor, surface, texts, undone } = view;
    surface.caret("p", 0);
    surface.type("ab");
    compose(view, "日本");
    expect(texts()).toEqual(["ab日本"]);
    surface.type("c");
    expect(texts()).toEqual(["ab日本c"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("syllables composed one by one are one step, however long each takes (D-131)", async () => {
    const view = await open(paragraph("p", "Слово: "));
    const { editor, surface, texts, undone } = view;
    surface.caret("p", 7);
    // Korean input commits a syllable when the next one starts: no pause between them.
    for (const syllable of ["한", "국", "어"]) compose(view, syllable, 700);
    expect(texts()).toEqual(["Слово: 한국어"]);
    expect(undone()).toEqual(["Слово: "]);
    expect(editor.undo()).toBe(false);
  });

  it("a pause before a composition still starts a new step", async () => {
    const view = await open(paragraph("p", ""));
    const { editor, surface, undone } = view;
    surface.caret("p", 0);
    surface.type("ab");
    pause(500);
    compose(view, "한");
    compose(view, "국", 300);
    expect(undone()).toEqual(["ab"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("a caret move or another block before a composition still starts a new step", async () => {
    const view = await open(paragraph("a", ""), paragraph("b", ""));
    const { editor, surface, texts, undone } = view;
    surface.caret("a", 0);
    surface.type("12");
    surface.caret("a", 1);
    compose(view, "한");
    surface.caret("b", 0);
    compose(view, "국");
    expect(texts()).toEqual(["1한2", "국"]);
    expect(undone()).toEqual(["1한2", ""]);
    expect(undone()).toEqual(["12", ""]);
    expect(undone()).toEqual(["", ""]);
    expect(editor.undo()).toBe(false);
  });

  it("an unchanged caret keeps its place in the step, but still leaves an atom made around it", async () => {
    const editor = await createOn(engine, {
      extensions: [Paragraph, Mention],
      content: doc(paragraph("p", "Привет @Анна😀 и всё")),
    });
    cleanups.push(() => editor.destroy());
    editor.setSelection({
      anchor: { blockId: "p", offset: 10 },
      head: { blockId: "p", offset: 10 },
    });
    const mention = { type: "mention", attrs: { id: "42", label: "Анна😀", kind: "user" } };
    editor.dispatch({ steps: [{ type: "addMark", blockId: "p", from: 7, to: 14, mark: mention }] });
    expect(editor.getViewState().selection.head).toEqual({ blockId: "p", offset: 7 });
  });

  it.runIf(engine === "wasm")("collaboration keeps the engine's own grouping", async () => {
    const { editor, surface, undone } = await open(paragraph("p", ""));
    editor.enableCollaboration("typing-peer");
    surface.caret("p", 0);
    surface.type("ab");
    pause(600);
    surface.type("cd");
    expect(undone()).toEqual(["ab"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });
});
