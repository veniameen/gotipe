import { afterEach, describe, expect, it } from "vitest";
import { FullPreset } from "../src/presets";
import type { Block, Document } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import type { BlockView } from "../src/types/view";
import { ENGINES, type Engine, block, createOn, doc, paragraph } from "./engines";

const active: { editor: GoTipeEditor; element: HTMLElement }[] = [];
afterEach(() => {
  for (const { editor, element } of active.splice(0)) {
    editor.destroy();
    element.remove();
  }
});

/** Mounts the editor on a plain DOM copy of its block tree and types through `beforeinput`. */
async function typing(engine: Engine, content: Document, caret: string) {
  const errors: unknown[] = [];
  const editor = await createOn(engine, {
    extensions: FullPreset,
    content,
    host: { onError: (error) => errors.push(error) },
  });
  const element = document.createElement("div");
  const render = (blocks: BlockView[], parent: HTMLElement) => {
    for (const { id, type, content: text, children } of blocks) {
      const node = document.createElement("div");
      node.dataset.blockId = id;
      node.dataset.blockType = type;
      if (Array.isArray(text)) node.append(text.map((span) => span.text).join(""));
      parent.append(node);
      render(children, node);
    }
  };
  render(editor.getViewState().blocks, element);
  document.body.append(element);
  editor.mount(element);
  active.push({ editor, element });
  editor.setSelection({
    anchor: { blockId: caret, offset: 0 },
    head: { blockId: caret, offset: 0 },
  });
  return {
    editor,
    errors,
    type(data: string) {
      for (const char of Array.from(data)) {
        const event = new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: char,
        });
        element.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }
    },
    blocks: () => (editor.getJSON() as Document).blocks,
  };
}

const task = (id: string, checked: boolean, children: Block[] = []): Block =>
  block(id, "todoItem", [], { checked }, children);
const listItem = (id: string, text: string, children: Block[] = []): Block =>
  block(id, "listItem", text ? [{ text, marks: [] }] : [], {}, children);

describe.each(ENGINES)("%s block input rules (D-11)", (engine) => {
  it("`[x] ` turns an empty paragraph into a checked task", async () => {
    const view = await typing(engine, doc(paragraph("p", "")), "p");
    view.type("[x] ");
    const [list] = view.blocks();
    expect(list).toMatchObject({ type: "todoList", children: [task("p", true)] });
    expect(view.blocks()).toHaveLength(1);
    expect(view.editor.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 0 });
    expect(view.errors).toEqual([]);
  });

  it("`[] ` still makes an unchecked task", async () => {
    const view = await typing(engine, doc(paragraph("p", "")), "p");
    view.type("[] ");
    expect(view.blocks()).toMatchObject([{ type: "todoList", children: [task("p", false)] }]);
    expect(view.errors).toEqual([]);
  });

  it("`[x] ` in an empty task of a list checks it and keeps the list", async () => {
    const list = block("tasks", "todoList", null, {}, [task("done", false), task("p", false)]);
    list.children[0]!.content = [{ text: "Ready", marks: [] }];
    const view = await typing(engine, doc(list), "p");
    view.type("[x] ");
    expect(view.blocks()).toEqual([{ ...list, children: [list.children[0], task("p", true)] }]);
    expect(view.errors).toEqual([]);
  });

  it("`[x] ` in an empty bullet item turns the list into tasks and checks only that one", async () => {
    const item = (id: string, text: string) =>
      block(id, "listItem", text ? [{ text, marks: [] }] : []);
    const list = block("list", "bulletList", null, {}, [item("first", "First"), item("p", "")]);
    const view = await typing(engine, doc(list), "p");
    view.type("[x] ");
    expect(view.blocks()).toMatchObject([
      {
        id: "list",
        type: "todoList",
        children: [
          { id: "first", type: "todoItem", attrs: { checked: false } },
          { id: "p", type: "todoItem", attrs: { checked: true }, content: [] },
        ],
      },
    ]);
    expect(view.errors).toEqual([]);
  });

  it("`$$` opens an empty formula without the trigger and types into it", async () => {
    const view = await typing(engine, doc(paragraph("before", "Text"), paragraph("p", "")), "p");
    view.type("$$");
    expect(view.blocks()[1]).toEqual({
      id: "p",
      type: "math",
      attrs: { display: "block" },
      content: "",
      children: [],
    });
    expect(view.editor.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 0 });
    view.type("x^2");
    expect(view.blocks()[1]!.content).toBe("x^2");
    expect(view.errors).toEqual([]);
  });
});

describe.each(ENGINES)("%s list rules in a list of the same kind (D-127)", (engine) => {
  it.each(["- ", "* "])(
    "`%s` in an empty bullet item removes the trigger and leaves the list as it was",
    async (trigger) => {
      const list = block("list", "bulletList", null, {}, [
        listItem("first", "First"),
        listItem("p", ""),
        listItem("last", "Last"),
      ]);
      const view = await typing(engine, doc(list), "p");
      view.type(trigger);
      expect(view.blocks()).toEqual([list]);
      expect(view.editor.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 0 });
      view.type("x");
      expect(view.blocks()[0]!.children[1]).toEqual(listItem("p", "x"));
      expect(view.errors).toEqual([]);
    },
  );

  it("`1. ` in an empty numbered item keeps the list and its numbering", async () => {
    const list = block("list", "orderedList", null, { start: 3 }, [
      listItem("first", "Third"),
      listItem("p", ""),
    ]);
    const view = await typing(engine, doc(list), "p");
    view.type("1. ");
    expect(view.blocks()).toEqual([list]);
    expect(view.editor.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 0 });
    expect(view.errors).toEqual([]);
  });

  it("`[] ` in an empty task keeps the tasks and their marks", async () => {
    const done = task("done", true);
    done.content = [{ text: "Done", marks: [] }];
    const list = block("tasks", "todoList", null, {}, [done, task("p", false)]);
    const view = await typing(engine, doc(list), "p");
    view.type("[] ");
    expect(view.blocks()).toEqual([list]);
    expect(view.editor.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 0 });
    expect(view.errors).toEqual([]);
  });

  it("`- ` in an empty item of a nested list keeps both lists", async () => {
    const nested = block("nested", "bulletList", null, {}, [
      listItem("inner", "Inner"),
      listItem("p", ""),
    ]);
    const list = block("list", "bulletList", null, {}, [listItem("outer", "Outer", [nested])]);
    const view = await typing(engine, doc(list), "p");
    view.type("- ");
    expect(view.blocks()).toEqual([list]);
    expect(view.errors).toEqual([]);
  });

  it("`1. ` in an empty bullet item still turns the list into a numbered one", async () => {
    const list = block("list", "bulletList", null, {}, [
      listItem("first", "First"),
      listItem("p", ""),
    ]);
    const view = await typing(engine, doc(list), "p");
    view.type("1. ");
    expect(view.blocks()).toEqual([{ ...list, type: "orderedList", attrs: { start: 1 } }]);
    expect(view.errors).toEqual([]);
  });

  it("`- ` in an empty paragraph still makes a bullet list", async () => {
    const view = await typing(engine, doc(paragraph("p", "")), "p");
    view.type("- ");
    expect(view.blocks()).toMatchObject([
      { type: "bulletList", children: [{ id: "p", type: "listItem", content: [] }] },
    ]);
    expect(view.errors).toEqual([]);
  });
});

describe.each(ENGINES)("%s `[] ` in a checked task (D-137)", (engine) => {
  it("`[] ` in an empty checked task unchecks it and keeps the list", async () => {
    const done = task("done", true);
    done.content = [{ text: "Done", marks: [] }];
    const list = block("tasks", "todoList", null, {}, [done, task("p", true)]);
    const view = await typing(engine, doc(list), "p");
    view.type("[] ");
    expect(view.blocks()).toEqual([{ ...list, children: [done, task("p", false)] }]);
    expect(view.editor.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 0 });
    expect(view.editor.undo()).toBe(true);
    expect(view.blocks()[0]!.children[1]).toMatchObject({ attrs: { checked: true } });
    expect(view.errors).toEqual([]);
  });

  it("`[x] ` still checks it, and `[] ` makes an unchecked task of a bullet item", async () => {
    const list = block("list", "bulletList", null, {}, [
      listItem("first", "First"),
      listItem("p", ""),
    ]);
    const view = await typing(engine, doc(list), "p");
    view.type("[] ");
    expect(view.blocks()).toMatchObject([
      {
        type: "todoList",
        children: [
          { id: "first", attrs: { checked: false } },
          { id: "p", attrs: { checked: false } },
        ],
      },
    ]);
    view.type("[x] ");
    expect(view.blocks()[0]!.children[1]).toMatchObject({ id: "p", attrs: { checked: true } });
    expect(view.errors).toEqual([]);
  });
});

/** A table of one row: the cell `c` and a neighbour with text. */
const table = () =>
  block("table", "table", null, {}, [
    block("row", "tableRow", null, {}, [
      block("c", "tableCell", [], {}),
      block("d", "tableCell", [{ text: "Keep", marks: [] }], {}),
    ]),
  ]);

describe.each(ENGINES)("%s block rules where the block can't stand (D-128)", (engine) => {
  it.each(["- ", "* ", "1. ", "[] ", "[x] ", "> ", "```js ", "$$", "# ", "---"])(
    "`%s` in a table cell stays typed text, without an error",
    async (trigger) => {
      const before = doc(table());
      const view = await typing(engine, before, "c");
      view.type(trigger);
      const typed = structuredClone(before.blocks);
      typed[0]!.children[0]!.children[0]!.content = [{ text: trigger, marks: [] }];
      expect(view.blocks()).toEqual(typed);
      expect(view.errors).toEqual([]);
      view.type("x");
      expect(view.blocks()[0]!.children[0]!.children[0]!.content).toEqual([
        { text: `${trigger}x`, marks: [] },
      ]);
    },
  );

  it.each(["> ", "[] ", "$$"])(
    "`%s` in a column that doesn't take its block stays typed text",
    async (trigger) => {
      const columns = block("cols", "columns", null, { count: 1 }, [
        block("col", "column", null, {}, [paragraph("p", "")]),
      ]);
      const view = await typing(engine, doc(columns), "p");
      view.type(trigger);
      expect(view.blocks()[0]!.children[0]!.children).toEqual([paragraph("p", trigger)]);
      expect(view.errors).toEqual([]);
    },
  );

  it("`- ` in a column still makes a list there", async () => {
    const columns = block("cols", "columns", null, { count: 1 }, [
      block("col", "column", null, {}, [paragraph("p", "")]),
    ]);
    const view = await typing(engine, doc(columns), "p");
    view.type("- ");
    expect(view.blocks()[0]!.children[0]!.children).toMatchObject([
      { type: "bulletList", children: [{ id: "p", type: "listItem", content: [] }] },
    ]);
    expect(view.errors).toEqual([]);
  });

  it.each([
    ["- ", "bulletList"],
    ["1. ", "orderedList"],
    ["[x] ", "todoList"],
    ["> ", "blockquote"],
    ["```js ", "codeBlock"],
    ["$$", "math"],
  ])("`%s` changes the block and drops the trigger in one undo step", async (trigger, type) => {
    const view = await typing(engine, doc(paragraph("before", "Text"), paragraph("p", "")), "p");
    view.type(trigger);
    expect(view.blocks()[1]!.type).toBe(type);
    expect(view.editor.undo()).toBe(true);
    expect(view.blocks()).toEqual([paragraph("before", "Text"), paragraph("p", trigger)]);
    expect(view.errors).toEqual([]);
  });
});
