import { afterEach, describe, expect, it, vi } from "vitest";
import { entries } from "../src/clipboard/document";
import { ClipboardHandler } from "../src/clipboard/handler";
import { decodeInternalPayload } from "../src/clipboard/payload";
import { createEditor } from "../src/js";
import type { Block, Document, Mark } from "../src/types/block";

const paragraph = (id: string, text: string, marks: Mark[] = []): Block => ({
  id,
  type: "paragraph",
  attrs: {},
  content: [{ text, marks }],
  children: [],
});
const doc = (...blocks: Block[]): Document => ({ version: 1, blocks });
function transfer(data: Record<string, string> = {}) {
  const preventDefault = vi.fn();
  const event = {
    preventDefault,
    clipboardData: {
      getData: (type: string) => data[type] ?? "",
      setData: (type: string, value: string) => {
        data[type] = value;
      },
    },
  } as unknown as ClipboardEvent;
  return { event, data, preventDefault };
}
async function setup(document: Document, blockId = document.blocks[0]!.id, offset = 0) {
  const errors: Error[] = [];
  const editor = await createEditor({
    extensions: [],
    content: document,
    host: { onError: (error) => errors.push(error) },
  });
  editor.setSelection({ anchor: { blockId, offset }, head: { blockId, offset } });
  return { editor, handler: new ClipboardHandler(editor), errors };
}
afterEach(() => vi.unstubAllGlobals());

describe("clipboard transactions", () => {
  it("pastes marked HTML inline and undoes text and marks together", async () => {
    const { editor, handler } = await setup(doc(paragraph("a", "abcd")), "a", 2);
    handler.onPaste(transfer({ "text/html": "<p><strong>Ж</strong><em>😀</em></p>" }).event);
    expect(editor.getText()).toBe("abЖ😀cd");
    expect(editor.getHTML()).toContain("<strong>Ж</strong><em>😀</em>");
    expect(editor.getViewState().selection.anchor.offset).toBe(5);
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("abcd");
    expect(editor.undo()).toBe(false);
    editor.destroy();
  });

  it("keeps the suffix after the last pasted line, not after the first", async () => {
    const { editor, handler } = await setup(doc(paragraph("a", "abcd")), "a", 2);
    handler.onPaste(transfer({ "text/plain": "X\r\nY" }).event);
    expect(editor.getText()).toBe("abX\nYcd");
    expect(editor.getViewState().selection.anchor.offset).toBe(1);
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("abcd");
    editor.destroy();
  });

  it("preserves HTML list nesting and regenerates every pasted ID", async () => {
    const { editor, handler } = await setup(doc(paragraph("a", "leftright")), "a", 4);
    handler.onPaste(
      transfer({ "text/html": "<ul><li><strong>outer</strong><ul><li>inner</li></ul></li></ul>" })
        .event,
    );
    expect(editor.getText()).toBe("left\nouter\ninner\nright");
    expect(editor.getHTML()).toContain("<strong>outer</strong>");
    const original = editor.getJSON() as Document;
    const list = original.blocks[1]!;
    expect(list.type).toBe("bulletList");
    editor.setSelection({
      anchor: { blockId: original.blocks.at(-1)!.id, offset: 5 },
      head: { blockId: original.blocks.at(-1)!.id, offset: 5 },
    });
    handler.onPaste(transfer({ "application/x-gotipe": JSON.stringify({ blocks: [list] }) }).event);
    const all = entries((editor.getJSON() as Document).blocks).map(({ block }) => block.id);
    expect(new Set(all).size).toBe(all.length);
    expect(editor.getText()).toBe("left\nouter\ninner\nright\nouter\ninner");
    editor.destroy();
  });

  it("copies and cuts reversed cross-block ranges without deleting unselected text", async () => {
    const { editor, handler } = await setup(doc(paragraph("a", "alpha"), paragraph("b", "bravo")));
    editor.setSelection({ anchor: { blockId: "b", offset: 2 }, head: { blockId: "a", offset: 2 } });
    const clipboard = transfer();
    handler.onCut(clipboard.event);
    expect(clipboard.data["text/plain"]).toBe("pha\nbr");
    expect(editor.getText()).toBe("alavo");
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("alpha\nbravo");
    editor.destroy();
  });

  it("does not cut on clipboard write failure", async () => {
    const { editor, handler } = await setup(doc(paragraph("a", "keep")));
    editor.setSelection({ anchor: { blockId: "a", offset: 0 }, head: { blockId: "a", offset: 4 } });
    const event = transfer().event;
    event.clipboardData!.setData = () => {
      throw new Error("denied");
    };
    handler.onCut(event);
    expect(editor.getText()).toBe("keep");
    expect(editor.undo()).toBe(false);
    editor.destroy();
  });

  it("does not paste into read-only documents", async () => {
    const { editor, handler } = await setup(doc(paragraph("a", "keep")));
    editor.setEditable(false);
    handler.onPaste(transfer({ "text/plain": "replace" }).event);
    expect(editor.getText()).toBe("keep");
    editor.destroy();
  });

  it("keeps multiple pasted lines inside a code block", async () => {
    const code: Block = {
      id: "code",
      type: "codeBlock",
      attrs: { language: "sql" },
      content: "SELECT;",
      children: [],
    };
    const { editor, handler } = await setup(doc(code), "code", 6);
    handler.onPaste(transfer({ "text/plain": " a\nFROM b" }).event);
    const result = editor.getJSON() as Document;
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.content).toBe("SELECT a\nFROM b;");
    editor.destroy();
  });

  it("pastes lines as list siblings and retains the trailing nested list", async () => {
    const nested: Block = {
      id: "nested",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [{ ...paragraph("child", "child"), type: "listItem" }],
    };
    const row: Block = { ...paragraph("row", "abcd"), type: "listItem", children: [nested] };
    const list: Block = {
      id: "list",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [row],
    };
    const { editor, handler } = await setup(doc(list), "row", 2);
    handler.onPaste(transfer({ "text/plain": "X\nY" }).event);
    const result = (editor.getJSON() as Document).blocks[0]!;
    expect(result.children.map((item) => item.type)).toEqual(["listItem", "listItem"]);
    expect(result.children[1]!.children[0]!.id).toBe("nested");
    expect(editor.getText()).toBe("abX\nYcd\nchild");
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("abcd\nchild");
    editor.destroy();
  });

  it("leaves a selected table cell intact when structured nesting is rejected", async () => {
    const cell = { ...paragraph("cell", "keep"), type: "tableCell" };
    const table: Block = {
      id: "table",
      type: "table",
      attrs: {},
      content: null,
      children: [{ id: "row", type: "tableRow", attrs: {}, content: null, children: [cell] }],
    };
    const { editor, handler, errors } = await setup(doc(table), "cell", 0);
    editor.setSelection({
      anchor: { blockId: "cell", offset: 0 },
      head: { blockId: "cell", offset: 4 },
    });
    handler.onPaste(transfer({ "text/html": "<table><tr><td>nested</td></tr></table>" }).event);
    expect(editor.getText()).toBe("keep");
    expect(editor.undo()).toBe(false);
    expect(errors[0]?.message).toContain("outside a table cell");
    editor.destroy();
  });

  it("falls back from malformed internal payload to safe plain text", async () => {
    const { editor, handler } = await setup(doc(paragraph("a", "")));
    handler.onPaste(
      transfer({ "application/x-gotipe": '{"spans":[{"text":3}]}', "text/plain": "safe" }).event,
    );
    expect(editor.getText()).toBe("safe");
    expect(
      decodeInternalPayload('{"blocks":[{"id":"a","type":"paragraph","children":"wrong"}]}'),
    ).toBeNull();
    editor.destroy();
  });

  it("ignores a late async clipboard result after another edit or disposal", async () => {
    let resolve: (text: string) => void = () => {};
    vi.stubGlobal("navigator", {
      clipboard: {
        readText: () =>
          new Promise<string>((done) => {
            resolve = done;
          }),
      },
    });
    const { editor, handler } = await setup(doc(paragraph("a", "")));
    handler.pasteFromSystemClipboard();
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "a", offset: 0, text: "new", marks: [] }],
    });
    resolve("stale");
    await Promise.resolve();
    await Promise.resolve();
    expect(editor.getText()).toBe("new");
    handler.pasteFromSystemClipboard();
    handler.destroy();
    resolve("destroyed");
    await Promise.resolve();
    await Promise.resolve();
    expect(editor.getText()).toBe("new");
    editor.destroy();
  });
});

it("pastes a durable uploaded asset atomically and undoes it with the selected text", async () => {
  const { editor, handler } = await setup(doc(paragraph("a", "before after")), "a", 7);
  const save = vi.fn().mockResolvedValue({ src: "assets/picture.png" });
  editor.host.saveAsset = save;
  editor.setSelection({ anchor: { blockId: "a", offset: 7 }, head: { blockId: "a", offset: 12 } });
  const event = transfer().event;
  Object.defineProperty(event.clipboardData, "files", {
    value: [new File(["image"], "picture.png", { type: "image/png" })],
  });
  handler.onPaste(event);
  await vi.waitFor(() =>
    expect(editor.getJSON().blocks.some((block) => block.type === "image")).toBe(true),
  );
  expect(save).toHaveBeenCalledOnce();
  expect(editor.getJSON().blocks.find((block) => block.type === "image")?.attrs.src).toBe(
    "assets/picture.png",
  );
  editor.undo();
  expect(editor.getText()).toBe("before after");
  editor.destroy();
});

it("does not insert a late file at a changed selection or after destruction", async () => {
  const { editor, handler, errors } = await setup(doc(paragraph("a", "before")));
  let complete!: (asset: { src: string }) => void;
  editor.host.saveAsset = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  const event = transfer().event;
  Object.defineProperty(event.clipboardData, "files", {
    value: [new File(["image"], "picture.png", { type: "image/png" })],
  });
  handler.onPaste(event);
  editor.chain().insertText("changed ").run();
  complete({ src: "assets/late.png" });
  await vi.waitFor(() => expect(errors).toHaveLength(1));
  expect(editor.getJSON().blocks).toHaveLength(1);
  expect(editor.getText()).toBe("changed before");
  handler.onPaste(event);
  handler.destroy();
  editor.destroy();
  complete({ src: "assets/late2.png" });
  await Promise.resolve();
  expect(errors).toHaveLength(1);
});
