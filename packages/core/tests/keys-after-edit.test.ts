import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flattenBlocks } from "../src/document/tree";
import { FullPreset } from "../src/presets";
import type { Block } from "../src/types/block";
import type { BlockView } from "../src/types/view";
import { ENGINES, type Engine, block, createOn, doc, paragraph, text } from "./engines";

// Frames run only when a test says so: the keys below come before the next one (docs/24, D-132).
const frames: FrameRequestCallback[] = [];
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  frames.length = 0;
  vi.unstubAllGlobals();
});
const nextFrame = () => {
  for (const callback of frames.splice(0)) callback(performance.now());
};
// Each key is a task of its own: the microtasks of the one before it have run.
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const item = (id: string, value: string, children: Block[] = []) =>
  block(id, "listItem", text(value), {}, children);
const list = (id: string, ...items: Block[]) => block(id, "bulletList", null, {}, items);

/** Draws the blocks into plain nodes; `render` writes model text into them like a renderer. */
async function open(engine: Engine, blocks: Block[], caret: { blockId: string; offset: number }) {
  const editor = await createOn(engine, { extensions: FullPreset, content: doc(...blocks) });
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
  editor.mount(element);
  cleanups.push(() => {
    editor.destroy();
    element.remove();
  });
  editor.setSelection({ anchor: caret, head: caret });
  nextFrame();
  const send = (event: Event) => {
    element.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return {
    editor,
    type(data: string) {
      const event = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data,
      });
      expect(send(event)).toBe(true);
    },
    /** Backspace as a browser sends it: `beforeinput` follows unless `keydown` handled the key. */
    backspace() {
      const key = new KeyboardEvent("keydown", {
        key: "Backspace",
        bubbles: true,
        cancelable: true,
      });
      if (send(key)) return;
      send(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "deleteContentBackward",
        }),
      );
    },
    /** Mod+V as a browser sends it: the `paste` event follows `keydown`; a menu sends no key. */
    paste(data: string, shortcut = true) {
      if (shortcut)
        send(
          new KeyboardEvent("keydown", {
            key: "v",
            metaKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { files: [], getData: (type: string) => (type === "text/plain" ? data : "") },
      });
      expect(send(event)).toBe(true);
    },
    /** React sets `nodeValue` of the text node it drew: a native caret inside goes to its start. */
    render() {
      for (const view of flattenBlocks(editor.getViewState().blocks)) {
        if (!Array.isArray(view.content)) continue;
        const node = element.querySelector(`[data-block-id="${view.id}"]`)!;
        const value = view.content.map((span) => span.text).join("");
        const own = Array.from(node.childNodes).find((child) => child instanceof Text);
        if (own) {
          if (own.nodeValue !== value) own.nodeValue = value;
        } else if (value) node.prepend(value);
      }
    },
    nativeCaret: () => {
      const selection = document.getSelection()!;
      return { node: selection.anchorNode, offset: selection.anchorOffset };
    },
  };
}

describe.each(ENGINES)("%s keys right after an edit (D-132)", (engine) => {
  it("Backspace right after typing in a list item deletes the character, not the item", async () => {
    const view = await open(engine, [list("list", item("first", "First"), item("item", "ab"))], {
      blockId: "item",
      offset: 2,
    });
    view.type("c");
    view.render();
    await nextTask();
    view.backspace();
    view.type("d");
    view.render();
    await nextTask();
    view.backspace();
    expect(view.editor.getJSON().blocks).toEqual([
      list("list", item("first", "First"), item("item", "ab")),
    ]);
    expect(view.editor.getViewState().selection.anchor).toEqual({ blockId: "item", offset: 2 });
  });

  it("puts the native caret back before the next event when the renderer rewrites the text", async () => {
    const view = await open(engine, [paragraph("p", "ab")], { blockId: "p", offset: 2 });
    view.type("c");
    view.render();
    // The renderer moved the native caret: the case the editor has to repair.
    expect(view.nativeCaret().offset).toBe(0);
    await nextTask();
    const caret = view.nativeCaret();
    expect(caret.node).toBe(document.querySelector('[data-block-id="p"]')!.firstChild);
    expect(caret.offset).toBe(3);
    expect(view.editor.getDOMSelection()).toEqual({
      anchor: { blockId: "p", offset: 3 },
      head: { blockId: "p", offset: 3 },
    });
  });

  it("text pasted right after typing goes where the typing left the caret", async () => {
    const view = await open(engine, [paragraph("p", "ab")], { blockId: "p", offset: 2 });
    view.type("c");
    view.render();
    await nextTask();
    view.paste("X");
    expect(view.editor.getJSON().blocks).toEqual([paragraph("p", "abcX")]);
  });

  it("before the renderer draws the typing, Mod+V pastes after it (D-136)", async () => {
    const view = await open(engine, [paragraph("p", "ab")], { blockId: "p", offset: 2 });
    view.type("c");
    await nextTask();
    view.paste("X");
    expect(view.editor.getJSON().blocks).toEqual([paragraph("p", "abcX")]);
    expect(view.editor.getViewState().selection.anchor).toEqual({ blockId: "p", offset: 4 });
  });

  it("before the renderer draws the typing, a paste without a key goes after it too (D-136)", async () => {
    const view = await open(engine, [paragraph("p", "ab")], { blockId: "p", offset: 2 });
    view.type("c");
    await nextTask();
    view.paste("X", false);
    expect(view.editor.getJSON().blocks).toEqual([paragraph("p", "abcX")]);
  });

  it("before the renderer draws the edit, Backspace in a list item acts at the model caret", async () => {
    const view = await open(engine, [list("list", item("item", ""))], {
      blockId: "item",
      offset: 0,
    });
    view.type("a");
    await nextTask();
    view.backspace();
    expect(view.editor.getJSON().blocks).toEqual([list("list", item("item", ""))]);
  });

  it("Backspace at the start of a list item still lifts it into a paragraph", async () => {
    const view = await open(engine, [list("list", item("first", "First"), item("item", "ab"))], {
      blockId: "item",
      offset: 0,
    });
    view.backspace();
    expect(view.editor.getJSON().blocks).toEqual([
      list("list", item("first", "First")),
      paragraph("item", "ab"),
    ]);
  });

  it("after the frame, a caret the browser moved by itself counts again", async () => {
    const view = await open(engine, [list("list", item("first", "First"), item("item", "ab"))], {
      blockId: "item",
      offset: 2,
    });
    view.type("c");
    view.render();
    await nextTask();
    nextFrame();
    const node = document.querySelector('[data-block-id="item"]')!.firstChild!;
    document.getSelection()!.setBaseAndExtent(node, 0, node, 0);
    view.backspace();
    expect(view.editor.getJSON().blocks).toEqual([
      list("list", item("first", "First")),
      paragraph("item", "abc"),
    ]);
  });
});

describe.each(ENGINES)("%s Backspace on a block selected as a whole (D-135)", (engine) => {
  it("deletes a selected list item, as it deletes a selected paragraph", async () => {
    const view = await open(
      engine,
      [paragraph("p", "Текст"), list("list", item("first", "First"), item("item", "ab😀"))],
      { blockId: "item", offset: 1 },
    );
    expect(view.editor.chain().selectBlock("item").run()).toBe(true);
    nextFrame();
    view.backspace();
    expect(view.editor.getJSON().blocks).toEqual([
      paragraph("p", "Текст"),
      list("list", item("first", "First")),
    ]);
    expect(view.editor.chain().selectBlock("p").run()).toBe(true);
    nextFrame();
    view.backspace();
    expect(view.editor.getJSON().blocks).toEqual([list("list", item("first", "First"))]);
  });

  it("Delete removes a selected block as well, not the character after its start", async () => {
    const view = await open(engine, [paragraph("a", "ab"), paragraph("b", "cd")], {
      blockId: "a",
      offset: 1,
    });
    expect(view.editor.chain().selectBlock("a").run()).toBe(true);
    nextFrame();
    const target = view.editor.element!;
    const key = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true });
    target.dispatchEvent(key);
    if (!key.defaultPrevented)
      target.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "deleteContentForward",
        }),
      );
    expect(view.editor.getJSON().blocks).toEqual([paragraph("b", "cd")]);
  });

  it("deletes it also while the caret restore waits for a frame", async () => {
    const view = await open(engine, [list("list", item("first", "First"), item("item", "ab"))], {
      blockId: "item",
      offset: 2,
    });
    expect(view.editor.chain().selectBlock("item").run()).toBe(true);
    view.backspace();
    expect(view.editor.getJSON().blocks).toEqual([list("list", item("first", "First"))]);
  });
});

describe.each(ENGINES)("%s typing on a block selected as a whole (D-180)", (engine) => {
  const shape = (blocks: Block[]) =>
    blocks.map(({ type, content }) => [type, Array.isArray(content) ? content : []]);
  /** Selects block `a` and sends `keys`, with the caret restore drawn or still waiting. */
  async function onSelected(keys: (view: Awaited<ReturnType<typeof open>>) => void, frame: boolean) {
    const view = await open(engine, [paragraph("a", "ab"), paragraph("b", "cd")], {
      blockId: "a",
      offset: 1,
    });
    expect(view.editor.chain().selectBlock("a").run()).toBe(true);
    if (frame) nextFrame();
    keys(view);
    const blocks = view.editor.getJSON().blocks;
    // The next run starts without this editor and its waiting restore.
    for (const cleanup of cleanups.splice(0)) cleanup();
    frames.length = 0;
    return blocks;
  }
  const enter = (view: Awaited<ReturnType<typeof open>>) => {
    const target = view.editor.element!;
    const key = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    target.dispatchEvent(key);
    if (!key.defaultPrevented)
      target.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertParagraph",
        }),
      );
  };

  it("a character replaces the selected block after the frame, as before it", async () => {
    const before = await onSelected((view) => view.type("x"), false);
    expect(before).toEqual([paragraph("b", "xcd")]);
    expect(await onSelected((view) => view.type("x"), true)).toEqual(before);
  });

  it("Enter acts on the selected block after the frame, as before it", async () => {
    const before = await onSelected(enter, false);
    expect(shape(before)).toEqual([
      ["paragraph", []],
      ["paragraph", text("cd")],
    ]);
    expect(shape(await onSelected(enter, true))).toEqual(shape(before));
  });

  it("a caret the user put in another block after the frame takes over", async () => {
    const blocks = await onSelected((view) => {
      const node = view.editor.element!.querySelector('[data-block-id="b"]')!.firstChild!;
      document.getSelection()!.collapse(node, 1);
      view.type("x");
    }, true);
    expect(blocks).toEqual([paragraph("a", "ab"), paragraph("b", "cxd")]);
  });
});
