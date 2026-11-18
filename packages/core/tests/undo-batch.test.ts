import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Bold, Paragraph } from "../src/extensions";
import type { GoTipeEditor } from "../src/types/editor";
import type { Step } from "../src/types/state";
import { type Engine, createOn, doc, mountForTyping, paragraph } from "./engines";

// `editor.batch(fn)`: the same undo steps on both engines and with the collaboration history.
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
});

const CASES: [Engine, boolean][] = [
  ["js", false],
  ["wasm", false],
  ["wasm", true],
];

const texts = (editor: GoTipeEditor) =>
  editor
    .getJSON()
    .blocks.map(
      (item) =>
        `${item.id}:${Array.isArray(item.content) ? item.content.map((span) => (span.marks.length ? `*${span.text}*` : span.text)).join("") : ""}`,
    );
const insertBlock = (id: string, index: number): Step => ({
  type: "insertBlock",
  parentId: null,
  index,
  block: paragraph(id, ""),
});
const insertText = (blockId: string, offset: number, text: string): Step => ({
  type: "insertText",
  blockId,
  offset,
  text,
  marks: [],
});

describe.each(CASES)("%s batch, collaboration: %s", (engine, collaboration) => {
  async function open() {
    const editor = await createOn(engine, {
      extensions: [Paragraph, Bold],
      content: doc(paragraph("p", "Hello")),
    });
    if (collaboration) editor.enableCollaboration("batch-peer");
    const caret = (blockId: string, offset: number) =>
      editor.setSelection({ anchor: { blockId, offset }, head: { blockId, offset } });
    caret("p", 5);
    const run = (...steps: Step[]) => editor.dispatch({ steps });
    return { editor, caret, run };
  }

  it("undoes the changes of a batch in one step and redoes them in one", async () => {
    const { editor, caret, run } = await open();
    const events: string[] = [];
    editor.on("transaction", () => events.push("transaction"));
    editor.on("update", () => events.push("update"));
    editor.batch(() => {
      run(insertBlock("n", 1));
      caret("n", 0);
      run(insertText("n", 0, "abc"));
      run({ type: "addMark", blockId: "n", from: 0, to: 3, mark: { type: "bold", attrs: {} } });
    });
    expect(texts(editor)).toEqual(["p:Hello", "n:*abc*"]);
    expect(events.filter((event) => event === "transaction")).toHaveLength(3);
    expect(events.filter((event) => event === "update")).toHaveLength(3);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["p:Hello"]);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 5 });
    expect(editor.undo()).toBe(false);
    expect(editor.redo()).toBe(true);
    expect(texts(editor)).toEqual(["p:Hello", "n:*abc*"]);
    expect(editor.redo()).toBe(false);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["p:Hello"]);
  });

  it("joins a nested batch to the outer one and ends the group with the outer one", async () => {
    const { editor, run } = await open();
    editor.batch(() => {
      run(insertText("p", 5, " a"));
      editor.batch(() => run(insertText("p", 7, " b")));
      run(insertText("p", 9, " c"));
    });
    run(insertText("p", 11, " d"));
    expect(texts(editor)).toEqual(["p:Hello a b c d"]);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["p:Hello a b c"]);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["p:Hello"]);
    expect(editor.undo()).toBe(false);
  });

  it("keeps the changes before a failed or cancelled one as one step", async () => {
    const { editor, run } = await open();
    const stop = editor.addTransactionFilter(
      ({ transaction }) => !transaction.steps.some((step) => step.type === "insertBlock"),
    );
    editor.batch(() => {
      run(insertText("p", 5, " a"));
      expect(() => run({ type: "deleteBlock", blockId: "missing" })).toThrow();
      expect(run(insertBlock("n", 1))).toBe(false);
      run(insertText("p", 7, " b"));
    });
    stop();
    expect(texts(editor)).toEqual(["p:Hello a b"]);
    expect(() =>
      editor.batch(() => {
        run(insertText("p", 9, " c"));
        throw new Error("host");
      }),
    ).toThrow("host");
    run(insertText("p", 11, " d"));
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["p:Hello a b c"]);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["p:Hello a b"]);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["p:Hello"]);
    expect(editor.undo()).toBe(false);
  });

  it("keeps typing before and after a batch in steps of their own", async () => {
    const { editor, caret, run } = await open();
    const surface = mountForTyping(editor);
    cleanups.push(() => surface.remove());
    surface.caret("p", 5);
    surface.type("ab");
    editor.batch(() => {
      run(insertBlock("n", 1));
      run(insertText("n", 0, "x"));
      caret("p", 7);
    });
    surface.type("cd");
    expect(texts(editor)).toEqual(["p:Helloabcd", "n:x"]);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["p:Helloab", "n:x"]);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["p:Helloab"]);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["p:Hello"]);
    expect(editor.undo()).toBe(false);
  });

  it("starts a new group after Undo inside a batch", async () => {
    const { editor, run } = await open();
    run(insertText("p", 5, " a"));
    editor.batch(() => {
      run(insertText("p", 7, " b"));
      editor.undo();
      run(insertText("p", 7, " c"));
      run(insertText("p", 9, " d"));
    });
    expect(texts(editor)).toEqual(["p:Hello a c d"]);
    expect(editor.undo()).toBe(true);
    expect(texts(editor)).toEqual(["p:Hello a"]);
  });
});
