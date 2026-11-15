import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Bold, Divider, Paragraph } from "../src/extensions";
import type { Block } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { block, createOn, doc, mountForTyping, paragraph } from "./engines";

// D-130: Undo takes back the same typing steps with and without collaboration. Every case
// runs on the WASM engine twice, with its own history and with the CRDT one, and expects
// the steps of D-08 (typing-history.test.ts).
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
});
const pause = (ms: number) => vi.setSystemTime(Date.now() + ms);
const texts = (editor: GoTipeEditor) =>
  editor
    .getJSON()
    .blocks.map((item) =>
      Array.isArray(item.content) ? item.content.map((span) => span.text).join("") : "",
    );

describe.each([false, true])("WASM typing history, collaboration: %s", (collaboration) => {
  async function open(...blocks: Block[]) {
    const editor = await createOn("wasm", {
      extensions: [Paragraph, Bold, Divider],
      content: doc(...blocks),
    });
    if (collaboration) editor.enableCollaboration("typing-peer");
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
    const undone = () => {
      expect(editor.undo()).toBe(true);
      return texts(editor);
    };
    return { editor, surface, input, undone };
  }

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
    const { editor, surface, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("abc");
    surface.caret("p", 1);
    surface.caret("p", 3);
    surface.type("d");
    surface.caret("p", 0);
    surface.type("Ж");
    expect(texts(editor)).toEqual(["Жabcd"]);
    expect(undone()).toEqual(["abcd"]);
    expect(undone()).toEqual(["abc"]);
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
    const { editor, surface, input, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("abcd");
    input("deleteContentBackward");
    input("deleteContentBackward");
    surface.type("😀");
    expect(texts(editor)).toEqual(["ab😀"]);
    expect(undone()).toEqual(["ab"]);
    expect(undone()).toEqual(["abcd"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("typing over a selection is one step with the typing after it", async () => {
    const { editor, surface, undone } = await open(paragraph("p", "Hello world"));
    surface.caret("p", 11);
    surface.type("!");
    const selection = { anchor: { blockId: "p", offset: 6 }, head: { blockId: "p", offset: 11 } };
    editor.setSelection(selection);
    surface.type("there");
    expect(texts(editor)).toEqual(["Hello there!"]);
    expect(undone()).toEqual(["Hello world!"]);
    expect(editor.getViewState().selection).toMatchObject(selection);
    expect(undone()).toEqual(["Hello world"]);
    expect(editor.undo()).toBe(false);
  });

  it("deleting a selection across blocks starts a step the next Backspaces join", async () => {
    const { editor, input, undone } = await open(paragraph("a", "hello"), paragraph("b", "world"));
    editor.setSelection({ anchor: { blockId: "a", offset: 3 }, head: { blockId: "b", offset: 2 } });
    input("deleteContentBackward");
    input("deleteContentBackward");
    input("deleteContentBackward");
    expect(texts(editor)).toEqual(["hrld"]);
    expect(undone()).toEqual(["hello", "world"]);
    expect(editor.undo()).toBe(false);
  });

  it("a line break, Enter, a command and a formatting toggle end the step", async () => {
    const { editor, surface, input, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("ab");
    surface.key("Enter", { shiftKey: true });
    input("insertLineBreak");
    surface.type("cd");
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "p", offset: 5, text: "X", marks: [] }],
      selection: { type: "cursor", blockId: "p", offset: 6 },
    });
    expect(editor.chain().toggleBold().run()).toBe(true);
    surface.type("ef");
    surface.key("Enter");
    input("insertParagraph");
    surface.type("gh");
    expect(texts(editor)).toEqual(["ab\ncdXef", "gh"]);
    expect(undone()).toEqual(["ab\ncdXef", ""]);
    expect(undone()).toEqual(["ab\ncdXef"]);
    expect(undone()).toEqual(["ab\ncdX"]);
    expect(undone()).toEqual(["ab\ncd"]);
    expect(undone()).toEqual(["ab\n"]);
    expect(undone()).toEqual(["ab"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("a host dispatch is a step of its own, also with its own metadata.typing", async () => {
    const { editor, surface, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("ab");
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "p", offset: 2, text: "X", marks: [] }],
      selection: { type: "cursor", blockId: "p", offset: 3 },
      metadata: { typing: "insert" },
    });
    expect(undone()).toEqual(["ab"]);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });

  it("a whole selected block deleted with Backspace is a step of its own", async () => {
    const { editor, input } = await open(
      paragraph("a", "ab"),
      block("hr", "divider", null),
      paragraph("c", "cd"),
    );
    // The CRDT counts the document version on, so the blocks are compared.
    const original = editor.getJSON().blocks;
    editor.dispatch({ steps: [], selection: { type: "block", blockId: "hr" } });
    input("deleteContentBackward");
    const removed = editor.getJSON().blocks;
    input("deleteContentForward");
    expect(texts(editor)).toEqual(["ab", "d"]);
    expect(editor.undo()).toBe(true);
    expect(editor.getJSON().blocks).toEqual(removed);
    expect(editor.undo()).toBe(true);
    expect(editor.getJSON().blocks).toEqual(original);
    expect(editor.undo()).toBe(false);
  });

  it("typing after Undo is a new step", async () => {
    const { editor, surface, undone } = await open(paragraph("p", ""));
    surface.caret("p", 0);
    surface.type("ab");
    expect(undone()).toEqual([""]);
    surface.type("cd");
    expect(editor.getViewState().toolbar.canRedo).toBe(false);
    expect(undone()).toEqual([""]);
    expect(editor.undo()).toBe(false);
  });
});

describe("WASM typing history with a peer", () => {
  /** Types `ab`, lets the peer insert `text` at `at` once it has the typing, types `cd`. */
  async function typeAround(at: { blockId: string; offset: number }, text: string) {
    const content = doc(paragraph("p", ""), paragraph("q", "tail"));
    const editor = await createOn("wasm", { extensions: [Paragraph], content });
    const peer = await createOn("wasm", { extensions: [Paragraph], content });
    cleanups.push(() => peer.destroy());
    editor.enableCollaboration("local");
    peer.enableCollaboration("remote");
    const surface = mountForTyping(editor);
    cleanups.push(() => surface.remove());
    surface.caret("p", 0);
    surface.type("ab");
    peer.receiveCollaborationUpdate(editor.getCollaborationUpdate());
    peer.dispatch({ steps: [{ type: "insertText", ...at, text, marks: [] }] });
    editor.receiveCollaborationUpdate(peer.getCollaborationUpdate());
    surface.type("cd");
    return editor;
  }

  it("a peer's edit in another block does not end the typing step, Undo keeps it", async () => {
    const editor = await typeAround({ blockId: "q", offset: 4 }, "!");
    expect(texts(editor)).toEqual(["abcd", "tail!"]);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["", "tail!"]);
    expect(editor.undo()).toBe(false);
  });

  it("a peer's text before the caret in the same block moves it and ends the step", async () => {
    const editor = await typeAround({ blockId: "p", offset: 0 }, "Ж");
    expect(texts(editor)).toEqual(["Жabcd", "tail"]);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["Жab", "tail"]);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["Ж", "tail"]);
    expect(editor.undo()).toBe(false);
  });
});
