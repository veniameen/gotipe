import { describe, expect, it, vi } from "vitest";
import { ownsInputTarget } from "../src/dom/input-owner";
import { installDOMSelection } from "../src/dom/selection";
import { createEditor } from "../src/js";
import { FullPreset } from "../src/presets";

describe("independent input ownership", () => {
  it("restores a transformed text host at the DOM commit before the next animation frame", async () => {
    const editor = await createEditor({
      extensions: FullPreset,
      content: {
        version: 1,
        blocks: [{ id: "p", type: "paragraph", attrs: {}, content: [], children: [] }],
      },
    });
    const root = document.createElement("div");
    root.innerHTML = '<p data-block-id="p" data-block-type="paragraph"><br></p>';
    document.body.append(root);
    editor.mount(root);
    try {
      editor.focus();
      root.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      document.getSelection()!.setBaseAndExtent(root, 0, root, 0);
      document.dispatchEvent(new Event("selectionchange"));
      expect(document.getSelection()!.anchorNode).toBe(root.querySelector("p"));
      editor.chain().setBlockType("codeBlock", { language: "text" }).run();
      root.innerHTML =
        '<div data-block-id="p" data-block-type="codeBlock"><header data-gotipe-widget contenteditable="false"><button>Copy</button></header><pre><code data-gotipe-text-content><br></code></pre></div>';
      await Promise.resolve();
      expect(document.getSelection()!.anchorNode).toBe(root.querySelector("code"));
      expect(document.getSelection()!.anchorOffset).toBe(0);
      root.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: "😀Ж",
        }),
      );
      expect(editor.getJSON().blocks[0]!.content).toBe("😀Ж");
    } finally {
      editor.destroy();
      root.remove();
    }
  });
  it("maps forward and backward editable-root boundaries to real UTF-16 leaves", () => {
    const root = document.createElement("div");
    root.contentEditable = "true";
    root.innerHTML =
      '<span data-gotipe-widget>Before</span><p data-block-id="a"><strong>Ж😀</strong></p><ul data-block-id="list" data-block-type="bulletList"><li data-block-id="b" data-block-type="listItem">Nested <em>尾😀</em></li></ul><span data-gotipe-widget>After</span><div data-gotipe-editor>Foreign editor</div>';
    document.body.append(root);
    const controller = new AbortController();
    const bridge = installDOMSelection(root, controller.signal, {
      getSelection: () => ({
        anchor: { blockId: "a", offset: 0 },
        head: { blockId: "a", offset: 0 },
      }),
      updateSelection: vi.fn(),
      getBlocks: () => [],
      redrawBlocks: vi.fn(),
      isComposing: () => false,
      consumeHandledInput: () => false,
    });
    try {
      const selection = document.getSelection()!;
      selection.setBaseAndExtent(root, 0, root, root.childNodes.length);
      expect(bridge.read()).toEqual({
        anchor: { blockId: "a", offset: 0 },
        head: { blockId: "b", offset: 10 },
      });
      selection.setBaseAndExtent(root, root.childNodes.length, root, 0);
      expect(bridge.read()).toEqual({
        anchor: { blockId: "b", offset: 10 },
        head: { blockId: "a", offset: 0 },
      });
      const paragraph = root.querySelector("p")!;
      selection.setBaseAndExtent(paragraph, 0, paragraph, paragraph.childNodes.length);
      expect(bridge.read()).toEqual({
        anchor: { blockId: "a", offset: 0 },
        head: { blockId: "a", offset: 3 },
      });
      const image = document.createElement("figure");
      image.setAttribute("data-block-id", "image");
      image.setAttribute("contenteditable", "false");
      image.innerHTML = '<figcaption contenteditable="true">Independent caption</figcaption>';
      root.append(image);
      selection.setBaseAndExtent(root, 0, root, root.childNodes.length);
      expect(bridge.read()).toEqual({
        anchor: { blockId: "a", offset: 0 },
        head: { blockId: "image", offset: 0 },
      });
    } finally {
      controller.abort();
      root.remove();
    }
  });
  it("restores an empty block caret inside the declared text host after leading widgets", async () => {
    const editor = await createEditor({
      extensions: FullPreset,
      content: {
        version: 1,
        blocks: [
          { id: "code", type: "codeBlock", attrs: { language: "text" }, content: "", children: [] },
        ],
      },
    });
    const root = document.createElement("div");
    root.innerHTML =
      '<div data-block-id="code" data-block-type="codeBlock"><header data-gotipe-widget contenteditable="false"><button>Copy</button></header><pre><code data-gotipe-text-content><br></code></pre></div>';
    document.body.append(root);
    editor.mount(root);
    try {
      editor.focus();
      editor.setSelection({
        anchor: { blockId: "code", offset: 0 },
        head: { blockId: "code", offset: 0 },
      });
      const host = root.querySelector("code")!;
      expect(document.getSelection()!.anchorNode).toBe(host);
      expect(document.getSelection()!.anchorOffset).toBe(0);
      host.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: "Ж😀",
        }),
      );
      expect(editor.getJSON().blocks[0]!.content).toBe("Ж😀");
    } finally {
      editor.destroy();
      root.remove();
    }
  });
  it("owns a real editable table cell through its noneditable table wrapper", async () => {
    const editor = await createEditor({
      extensions: FullPreset,
      content: {
        version: 1,
        blocks: [
          {
            id: "table",
            type: "table",
            attrs: {},
            content: null,
            children: [
              {
                id: "row",
                type: "tableRow",
                attrs: {},
                content: null,
                children: ["a", "b"].map((id) => ({
                  id,
                  type: "tableCell",
                  attrs: {},
                  content: [{ text: id, marks: [] }],
                  children: [],
                })),
              },
            ],
          },
        ],
      },
    });
    const root = document.createElement("div");
    root.innerHTML =
      '<div data-block-id="table" data-block-type="table" contenteditable="false"><table><tbody><tr data-block-id="row" data-block-type="tableRow"><td data-block-id="a" data-block-type="tableCell" contenteditable="true">a</td><td data-block-id="b" data-block-type="tableCell" contenteditable="true">b</td></tr></tbody></table></div>';
    document.body.append(root);
    editor.mount(root);
    try {
      const cell = root.querySelector("td")!;
      cell.focus();
      document.getSelection()!.setBaseAndExtent(cell.firstChild!, 1, cell.firstChild!, 1);
      document.dispatchEvent(new Event("selectionchange"));
      expect(editor.getViewState().selection.anchor).toEqual({ blockId: "a", offset: 1 });
      const input = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: "😀",
      });
      cell.dispatchEvent(input);
      expect(input.defaultPrevented).toBe(true);
      expect(editor.getText()).toContain("a😀");
      root.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      editor.setSelection({
        anchor: { blockId: "b", offset: 0 },
        head: { blockId: "b", offset: 0 },
      });
      root.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      document.getSelection()!.setBaseAndExtent(cell.firstChild!, 1, cell.firstChild!, 1);
      // Do not deliver selectionchange: a real click can be followed by Tab first.
      const tab = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" });
      cell.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(true);
      expect(editor.getViewState().selection.anchor.blockId).toBe("b");
    } finally {
      editor.destroy();
      root.remove();
    }
  });
  it("keeps a caption caret when every typed character dispatches an attribute update", async () => {
    vi.useFakeTimers();
    const editor = await createEditor({
      extensions: [],
      content: {
        version: 1,
        blocks: [
          {
            id: "a",
            type: "paragraph",
            attrs: {},
            content: [{ text: "document", marks: [] }],
            children: [],
          },
          { id: "image", type: "image", attrs: { caption: "" }, content: null, children: [] },
        ],
      },
    });
    const root = document.createElement("div");
    root.innerHTML =
      '<p data-block-id="a">document</p><figure data-block-id="image" contenteditable="false"><figcaption contenteditable="true" data-gotipe-input tabindex="0"></figcaption></figure>';
    document.body.append(root);
    editor.mount(root);
    const caption = root.querySelector("figcaption")!;
    const node = document.createTextNode("");
    caption.append(node);
    caption.focus();
    try {
      for (const character of Array.from("Подпись😀")) {
        node.data += character;
        document.getSelection()!.setBaseAndExtent(node, node.length, node, node.length);
        editor.dispatch({
          steps: [{ type: "setBlockAttrs", blockId: "image", attrs: { caption: node.data } }],
        });
        await vi.runAllTimersAsync();
        expect(document.getSelection()!.anchorNode).toBe(node);
        expect(document.getSelection()!.anchorOffset).toBe(node.length);
        expect(document.activeElement).toBe(caption);
      }
      expect(editor.getJSON().blocks[0]!.content).toEqual([{ text: "document", marks: [] }]);
      expect(editor.getJSON().blocks[1]!.attrs.caption).toBe("Подпись😀");
    } finally {
      editor.destroy();
      root.remove();
      vi.useRealTimers();
    }
  });
  it("keeps table text owned and excludes controls, captions, widgets and nested editors", () => {
    const root = document.createElement("div");
    root.innerHTML = `<table><tbody><tr><td contenteditable="true">cell</td></tr></tbody></table>
      <figure contenteditable="false"><figcaption contenteditable="true">caption</figcaption><input></figure>
      <div data-gotipe-input contenteditable="true">input</div><span data-gotipe-widget>widget</span>
      <div data-gotipe-editor contenteditable="true">nested</div><textarea></textarea><select></select>`;
    expect(ownsInputTarget(root, root.querySelector("td")!.firstChild)).toBe(true);
    for (const selector of [
      "figcaption",
      "input",
      "[data-gotipe-input]",
      "[data-gotipe-widget]",
      "[data-gotipe-editor]",
      "textarea",
      "select",
    ])
      expect(ownsInputTarget(root, root.querySelector(selector))).toBe(false);
  });

  it("leaves nested caption typing, composition, paste and shortcuts to the caption", async () => {
    const editor = await createEditor({
      extensions: [],
      content: {
        version: 1,
        blocks: [
          {
            id: "a",
            type: "paragraph",
            attrs: {},
            content: [{ text: "document", marks: [] }],
            children: [],
          },
        ],
      },
    });
    const root = document.createElement("div");
    root.innerHTML =
      '<p data-block-id="a">document</p><figure contenteditable="false"><figcaption contenteditable="true" data-gotipe-input>caption</figcaption></figure>';
    document.body.append(root);
    editor.mount(root);
    const caption = root.querySelector("figcaption")!;
    document.getSelection()!.setBaseAndExtent(caption.firstChild!, 7, caption.firstChild!, 7);
    document.dispatchEvent(new Event("selectionchange"));
    expect(editor.getViewState().selection.anchor.blockId).toBe("a");
    const events = [
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: "!",
      }),
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Backspace" }),
      new Event("paste", { bubbles: true, cancelable: true }),
      new Event("copy", { bubbles: true, cancelable: true }),
      new CompositionEvent("compositionstart", { bubbles: true }),
      new CompositionEvent("compositionend", { bubbles: true, data: "漢" }),
    ];
    for (const event of events) {
      caption.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(editor.getText()).toBe("document");
    editor.destroy();
    root.remove();
  });
});
