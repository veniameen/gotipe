// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MediaBlocksContext } from "./content/media-blocks";
import { EditorContent } from "./editor-content";
import { mediaBlocks } from "./media";

let editor: GoTipeEditor;
let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  editor = await createEditor({
    extensions: [FullPreset],
    content: {
      version: 1,
      blocks: [
        {
          id: "heading",
          type: "heading",
          attrs: { level: 2 },
          content: [{ text: "Title", marks: [] }],
          children: [],
        },
        {
          id: "body",
          type: "paragraph",
          attrs: {},
          content: [{ text: "Body", marks: [] }],
          children: [],
        },
        {
          id: "image",
          type: "image",
          attrs: { src: "https://example.test/image.png", alt: "Image", caption: "Caption" },
          content: null,
          children: [],
        },
      ],
    },
  });
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
});

describe("EditorContent rendering contracts", () => {
  it("afterBlock draws the host's element in the flow after its block, outside the text", () => {
    const draw = (blockId: string | null) =>
      act(() =>
        root.render(
          <EditorContent
            editor={editor}
            afterBlock={blockId ? { blockId, node: <input aria-label="Ask" /> } : null}
          />,
        ),
      );
    draw("heading");
    const content = container.querySelector("[data-gotipe-content]")!;
    const slot = () => content.querySelector<HTMLElement>("[data-gotipe-block-slot]");
    expect(slot()?.previousElementSibling?.getAttribute("data-block-id")).toBe("heading");
    expect(slot()?.nextElementSibling?.getAttribute("data-block-id")).toBe("body");
    expect(slot()?.getAttribute("contenteditable")).toBe("false");
    expect(slot()?.hasAttribute("data-gotipe-widget")).toBe(true);
    const input = slot()!.querySelector("input")!;
    input.value = "typed";
    // it moves with its block id and keeps the host's element (its state)
    draw("body");
    expect(slot()?.previousElementSibling?.getAttribute("data-block-id")).toBe("body");
    expect(slot()!.querySelector("input")).toBe(input);
    expect(input.value).toBe("typed");
    // the document's text and blocks know nothing of it
    expect(editor.getViewState().blocks.map((b) => b.id)).toEqual(["heading", "body", "image"]);
    draw("missing");
    expect(slot()).toBeNull();
    draw(null);
    expect(slot()).toBeNull();
  });

  it("uses the documented legacy renderer and falls back only for null results", () => {
    act(() =>
      root.render(
        <EditorContent
          editor={editor}
          blockRenderer={({ block, children }) =>
            block.type === "heading" ? <section className="custom-title">{children}</section> : null
          }
        />,
      ),
    );
    expect(container.querySelector("section[data-block-id=heading]")?.textContent).toBe("Title");
    expect(container.querySelector("p[data-block-id=body]")?.textContent).toBe("Body");
    expect(editor.element).toBe(container.querySelector("[data-gotipe-content]"));
  });

  it("keeps node decoration classes on default and media roots", () => {
    act(() => {
      root.render(<EditorContent editor={editor} />);
      editor.setDecorations("review", [
        { type: "node", key: "body", blockId: "body", className: "review-body" },
        { type: "node", key: "image", blockId: "image", className: "review-image" },
      ]);
    });
    expect(container.querySelector("[data-block-id=body]")?.classList.contains("review-body")).toBe(
      true,
    );
    expect(
      container.querySelector("[data-block-id=image]")?.classList.contains("review-image"),
    ).toBe(true);
    expect(
      container.querySelector("[data-block-id=image]")?.classList.contains("gotipe-image-block"),
    ).toBe(true);
  });

  it("gives explicit block views precedence and preserves their content and metadata", () => {
    act(() =>
      root.render(
        <EditorContent
          editor={editor}
          blockRenderer={() => <div>legacy</div>}
          blockViews={{
            heading: ({ rootProps, content }) => (
              <h2 {...rootProps} className="specific">
                {content}
              </h2>
            ),
          }}
        />,
      ),
    );
    expect(container.querySelector("h2[data-block-id=heading]")?.textContent).toBe("Title");
    expect(container.querySelector("[data-block-id=body]")?.textContent).toBe("legacy");
  });

  it("draws afterText right after a block's text as a widget, in default and custom views", () => {
    const after = (block: { id: string; type: string }) =>
      block.type === "heading" ? <b className="after">#</b> : null;
    act(() => root.render(<EditorContent editor={editor} afterText={after} />));
    const heading = container.querySelector("[data-block-id=heading]")!;
    const widget = heading.lastElementChild!;
    // outside the document's text and offsets, and not editable
    expect(widget.matches("span[data-gotipe-widget][contenteditable=false]")).toBe(true);
    expect(widget.innerHTML).toBe('<b class="after">#</b>');
    expect(heading.textContent).toBe("Title#");
    expect(editor.getText()).toContain("Title");
    expect(editor.getText()).not.toContain("#");
    expect(container.querySelector("[data-block-id=body] [data-gotipe-widget]")).toBeNull();

    // a custom view gets it with its `content`
    act(() =>
      root.render(
        <EditorContent
          editor={editor}
          afterText={after}
          blockViews={{
            heading: ({ rootProps, content }) => (
              <h3 {...rootProps} className="custom">
                {content}
              </h3>
            ),
          }}
        />,
      ),
    );
    expect(container.querySelector("h3.custom .after")).not.toBeNull();
  });

  it("draws no afterText in a block without text or in a suggested block", () => {
    act(() => {
      editor.setContent({
        version: 1,
        blocks: [
          { id: "empty", type: "heading", attrs: { level: 2 }, content: [], children: [] },
          {
            id: "full",
            type: "heading",
            attrs: { level: 2 },
            content: [{ text: "Full", marks: [] }],
            children: [],
          },
        ],
      });
      root.render(<EditorContent editor={editor} afterText={() => <b className="after" />} />);
      editor.setDecorations("review", [
        {
          type: "blocks",
          key: "suggested",
          blockId: "full",
          position: "after",
          blocks: [
            {
              id: "suggested",
              type: "heading",
              attrs: { level: 2 },
              content: [{ text: "Proposed", marks: [] }],
              children: [],
              decorations: [],
            },
          ],
        },
      ]);
    });
    expect(container.querySelector("[data-block-id=empty] .after")).toBeNull();
    expect(container.querySelector("[data-block-id=full] .after")).not.toBeNull();
    expect(container.querySelector("[data-gotipe-phantom-id=suggested]")?.textContent).toBe(
      "Proposed",
    );
    expect(container.querySelector("[data-gotipe-phantom-id=suggested] .after")).toBeNull();
  });

  it("makes image captions and edit controls inactive in read-only mode", () => {
    act(() => {
      root.render(
        <MediaBlocksContext.Provider value={mediaBlocks}>
          <EditorContent editor={editor} />
        </MediaBlocksContext.Provider>,
      );
      editor.setEditable(false);
    });
    expect(
      container.querySelector('figcaption [role="textbox"]')?.getAttribute("contenteditable"),
    ).toBe("false");
    expect(
      container.querySelector('figcaption [role="textbox"]')?.hasAttribute("data-gotipe-input"),
    ).toBe(true);
    expect(container.querySelector("[data-gotipe-image-toolbar]")?.hasAttribute("inert")).toBe(
      true,
    );
  });
  it("renders nested todo rows and keeps child pointer selection out of the parent", () => {
    act(() => {
      editor.setContent({
        blocks: [
          {
            id: "todos",
            type: "todoList",
            attrs: {},
            content: null,
            children: [
              {
                id: "parent",
                type: "todoItem",
                attrs: { checked: false },
                content: [{ text: "Parent", marks: [] }],
                children: [
                  {
                    id: "nested",
                    type: "todoList",
                    attrs: {},
                    content: null,
                    children: [
                      {
                        id: "child",
                        type: "todoItem",
                        attrs: { checked: false },
                        content: [{ text: "Child", marks: [] }],
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      root.render(<EditorContent editor={editor} />);
    });
    const child = container.querySelector('[data-block-id="child"]')!;
    const host = child.querySelector("[data-gotipe-todo-content]")!;
    expect(host.textContent).toBe("Child");
    act(() => host.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 0 })));
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "child", offset: 0 });
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  it.each(["paragraph", "codeBlock"])(
    "reconciles native IME DOM removal in an empty %s before React updates",
    (type) => {
      act(() => {
        editor.setContent({
          blocks: [
            {
              id: "ime",
              type,
              attrs: type === "codeBlock" ? { language: "" } : {},
              content: type === "codeBlock" ? "" : [],
              children: [],
            },
          ],
        });
        root.render(<EditorContent editor={editor} />);
      });
      const surface = container.querySelector<HTMLElement>("[data-gotipe-content]")!;
      const block = surface.querySelector<HTMLElement>('[data-block-id="ime"]')!;
      const host = block.querySelector<HTMLElement>("[data-gotipe-text-content]") ?? block;
      act(() =>
        editor.setSelection({
          anchor: { blockId: "ime", offset: 0 },
          head: { blockId: "ime", offset: 0 },
        }),
      );
      surface.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      // Firefox/IME removes the original BR/text children while it owns the DOM.
      host.replaceChildren(document.createTextNode("До😀"));
      act(() =>
        surface.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true, data: "До😀" }),
        ),
      );
      const updated = surface.querySelector<HTMLElement>('[data-block-id="ime"]')!;
      expect((updated.querySelector("[data-gotipe-text-content]") ?? updated).textContent).toBe(
        "До😀",
      );
      expect(editor.getText()).toBe("До😀");
      expect(editor.getViewState().selection.anchor).toEqual({ blockId: "ime", offset: 4 });
      act(() => editor.chain().insertText("!").run());
      expect(editor.getText()).toBe("До😀!");
      act(() => {
        editor.undo();
        editor.undo();
      });
      expect(editor.getText()).toBe("");
      expect(editor.getViewState().toolbar.canUndo).toBe(false);
    },
  );
  it.each([false, true])(
    "reconciles native IME replacing a cross-block selection (reverse=%s)",
    (reverse) => {
      const blocks = ["Before", "After", "Tail"].map((text, index) => ({
        id: String(index),
        type: "paragraph",
        attrs: {},
        content: [{ text, marks: [] }],
        children: [],
      }));
      act(() => {
        editor.setContent({ blocks });
        root.render(<EditorContent editor={editor} />);
        const start = { blockId: "0", offset: 2 };
        const end = { blockId: "1", offset: 2 };
        editor.setSelection({ anchor: reverse ? end : start, head: reverse ? start : end });
      });
      const surface = container.querySelector<HTMLElement>("[data-gotipe-content]")!;
      surface.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      surface
        .querySelector('[data-block-id="0"]')!
        .replaceChildren(document.createTextNode("BeЖ😀ter"));
      surface.querySelector('[data-block-id="1"]')!.remove();
      act(() =>
        surface.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true, data: "Ж😀" }),
        ),
      );
      expect(editor.getText()).toBe("BeЖ😀ter\nTail");
      expect(surface.querySelector('[data-block-id="0"]')?.textContent).toBe("BeЖ😀ter");
      expect(editor.getJSON().blocks.map((block) => block.id)).toEqual(["0", "2"]);
      act(() => editor.undo());
      expect(editor.getJSON().blocks).toEqual(blocks);
      expect(editor.getViewState().toolbar.canUndo).toBe(false);
    },
  );
  it.each([false, true])(
    "restores renderer nodes before external edits interrupt IME (cross-block %s)",
    (crossBlock) => {
      const blocks = ["Before", "After", "Tail"].map((text, index) => ({
        id: String(index),
        type: "paragraph",
        attrs: {},
        content: [{ text, marks: [] }],
        children: [],
      }));
      const errors: { code: string; details?: Record<string, unknown> }[] = [];
      const unsubscribe = editor.on("error", (error) => errors.push(error));
      act(() => {
        editor.setContent({ blocks });
        root.render(<EditorContent editor={editor} />);
        editor.setSelection({
          anchor: { blockId: "0", offset: 2 },
          head: { blockId: crossBlock ? "1" : "0", offset: 2 },
        });
      });
      const surface = container.querySelector<HTMLElement>("[data-gotipe-content]")!;
      surface.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      surface.dispatchEvent(
        new CompositionEvent("compositionupdate", { bubbles: true, data: "Ж😀" }),
      );
      surface
        .querySelector('[data-block-id="0"]')!
        .replaceChildren(document.createTextNode(crossBlock ? "BeЖ😀ter" : "BeЖ😀fore"));
      if (crossBlock) surface.querySelector('[data-block-id="1"]')!.remove();
      act(() =>
        editor.dispatch({
          steps: [{ type: "insertText", blockId: "0", offset: 0, text: "REMOTE" }],
        }),
      );
      const current = editor.getJSON();
      act(() => {
        surface.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: "Ж😀",
          }),
        );
        surface.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true, data: "Ж😀" }),
        );
      });
      expect(editor.getJSON()).toEqual(current);
      expect(surface.textContent).toBe("REMOTEBeforeAfterTail");
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ code: "COMPOSITION_CONFLICT", details: { text: "Ж😀" } });
      act(() => editor.undo());
      expect(editor.getJSON().blocks).toEqual(blocks);
      expect(surface.textContent).toBe("BeforeAfterTail");
      unsubscribe();
    },
  );
  it("defers new phantom decorations until native DOM ownership is reconciled", () => {
    const blocks = ["Before", "After"].map((text, index) => ({
      id: String(index),
      type: "paragraph",
      attrs: {},
      content: [{ text, marks: [] }],
      children: [],
    }));
    const errors: string[] = [];
    const unsubscribe = editor.on("error", (error) => errors.push(error.code));
    act(() => {
      editor.setContent({ blocks });
      root.render(<EditorContent editor={editor} />);
      editor.setSelection({
        anchor: { blockId: "0", offset: 2 },
        head: { blockId: "1", offset: 2 },
      });
    });
    const surface = editor.element!;
    surface.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    surface.dispatchEvent(
      new CompositionEvent("compositionupdate", { bubbles: true, data: "Ж😀" }),
    );
    surface.querySelector('[data-block-id="0"]')!.textContent = "BeЖ😀ter";
    surface.querySelector('[data-block-id="1"]')!.remove();
    act(() =>
      editor.setDecorations("review", [
        {
          type: "blocks",
          key: "suggested",
          blockId: "0",
          position: "after",
          blocks: [
            {
              id: "suggested",
              type: "paragraph",
              attrs: {},
              content: [{ text: "Proposed", marks: [] }],
              children: [],
              decorations: [],
            },
          ],
        },
      ]),
    );
    act(() =>
      surface.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "Ж😀" })),
    );
    expect(surface.textContent).toBe("BeЖ😀terProposed");
    expect(editor.getText()).toBe("BeЖ😀ter");
    expect(errors).toEqual([]);
    act(() => editor.setDecorations("review", []));
    expect(surface.textContent).toBe("BeЖ😀ter");
    unsubscribe();
  });
});
