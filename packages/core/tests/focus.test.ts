import { afterEach, describe, expect, it } from "vitest";
import { FullPreset } from "../src/presets";
import type { Block } from "../src/types/block";
import type { CreateEditorOptions } from "../src/types/editor";
import type { BlockView } from "../src/types/view";
import { ENGINES, type Engine, block, createOn, doc, paragraph, text } from "./engines";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const item = (id: string, value: string) => block(id, "listItem", text(value));
const list = (id: string, ...items: Block[]) => block(id, "bulletList", null, {}, items);
const divider = (id: string) => block(id, "divider", null);

/** Creates and mounts an editor on plain nodes of its blocks, as a renderer would draw them. */
async function mounted(engine: Engine, blocks: Block[], options: Partial<CreateEditorOptions>) {
  const editor = await createOn(engine, {
    extensions: FullPreset,
    content: doc(...blocks),
    ...options,
  });
  const element = document.createElement("div");
  const draw = (views: BlockView[], parent: HTMLElement) => {
    for (const { id, type, content, children } of views) {
      const node = document.createElement("div");
      node.dataset.blockId = id;
      node.dataset.blockType = type;
      if (Array.isArray(content) && content.length)
        node.append(content.map((span) => span.text).join(""));
      parent.append(node);
      draw(children, node);
    }
  };
  draw(editor.getViewState().blocks, element);
  document.body.append(element);
  cleanups.push(() => {
    editor.destroy();
    element.remove();
  });
  const changes: string[] = [];
  editor.on("selectionChange", () => changes.push("selectionChange"));
  editor.mount(element);
  return { editor, element, changes };
}

const caret = (editor: { getViewState(): { selection: { anchor: object; head: object } } }) => {
  const { anchor, head } = editor.getViewState().selection;
  expect(head).toEqual(anchor);
  return anchor;
};

describe.each(ENGINES)("%s autofocus and focus(position) (D-13)", (engine) => {
  const content = [
    paragraph("p", "Привет"),
    list("list", item("one", "один"), item("two", "два😀")),
  ];

  it('autofocus "end" puts the caret at the end of the last text, inside the list', async () => {
    const { editor, element, changes } = await mounted(engine, content, { autofocus: "end" });
    expect(document.activeElement).toBe(element);
    expect(caret(editor)).toEqual({ blockId: "two", offset: 5 });
    expect(changes).toContain("selectionChange");
    expect(editor.getDOMSelection()?.anchor).toEqual({ blockId: "two", offset: 5 });
  });

  it('autofocus "start" puts the caret at the start of the first text, past a divider', async () => {
    const { editor, element } = await mounted(engine, [divider("line"), ...content], {
      autofocus: "start",
    });
    expect(document.activeElement).toBe(element);
    expect(caret(editor)).toEqual({ blockId: "p", offset: 0 });
  });

  it("autofocus true keeps the caret where the editor starts", async () => {
    const { editor, element, changes } = await mounted(engine, content, { autofocus: true });
    expect(document.activeElement).toBe(element);
    expect(caret(editor)).toEqual({ blockId: "p", offset: 0 });
    expect(changes).toEqual([]);
  });

  it('focus("end") goes into the last list item; focus() keeps a selected range', async () => {
    const { editor } = await mounted(engine, content, {});
    editor.focus("end");
    expect(caret(editor)).toEqual({ blockId: "two", offset: 5 });
    editor.setSelection({
      anchor: { blockId: "p", offset: 1 },
      head: { blockId: "one", offset: 2 },
    });
    editor.focus();
    expect(editor.getViewState().selection.head).toEqual({ blockId: "one", offset: 2 });
    editor.focus("start");
    expect(caret(editor)).toEqual({ blockId: "p", offset: 0 });
  });
});
