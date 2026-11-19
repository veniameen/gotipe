// @vitest-environment jsdom
import { type BlockView, type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type BlockViewProps, EditorContent } from "../editor-content";

const text = (value: string) => (value ? [{ text: value, marks: [] }] : []);
const block = (id: string, type: string, value: string | null, children: unknown[] = []) => ({
  id,
  type,
  attrs: type === "heading" ? { level: 2 } : {},
  content: value === null ? null : text(value),
  children,
});

let editor: GoTipeEditor;
let container: HTMLDivElement;
let root: Root;
/** Blocks drawn since the last `drawn()`: `afterText` runs once for each block with text drawn. */
let seen: string[] = [];
const afterText = (view: BlockView) => {
  seen.push(view.id);
  return null;
};
const drawn = () => seen.splice(0).sort();
const type = (blockId: string, value: string) =>
  act(() => {
    editor.dispatch({
      steps: [{ type: "insertText", blockId, offset: 0, text: value, marks: [] }],
    });
  });

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  seen = [];
  editor = await createEditor({
    extensions: [FullPreset],
    content: {
      version: 1,
      blocks: [
        block("title", "heading", "Title"),
        block("a", "paragraph", "First"),
        block("list", "bulletList", null, [
          block("i1", "listItem", "One"),
          block("i2", "listItem", "Two", [
            block("inner", "bulletList", null, [block("i3", "listItem", "Three")]),
          ]),
        ]),
        block("empty", "paragraph", ""),
        block("b", "paragraph", "Last"),
      ],
    },
  });
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
});

describe("blocks drawn by the built-in views", () => {
  it("draws only the edited block again", () => {
    act(() => root.render(<EditorContent editor={editor} afterText={afterText} />));
    expect(drawn()).toEqual(["a", "b", "i1", "i2", "i3", "title"]);
    type("a", "x");
    expect(drawn()).toEqual(["a"]);
    expect(container.querySelector("[data-block-id=a]")?.textContent).toBe("xFirst");
    // an edit under a list draws the list's own blocks, not the other top-level blocks
    type("i3", "y");
    expect(drawn()).toEqual(["i1", "i2", "i3"]);
    expect(container.querySelector("[data-block-id=i3]")?.textContent).toBe("yThree");
  });

  it("draws the blocks the caret leaves and enters", () => {
    act(() => root.render(<EditorContent editor={editor} afterText={afterText} />));
    const placeholder = () =>
      container.querySelector("[data-block-id=empty]")?.getAttribute("data-placeholder");
    expect(placeholder()).toBeNull();
    act(() =>
      editor.setSelection({
        anchor: { blockId: "empty", offset: 0 },
        head: { blockId: "empty", offset: 0 },
      }),
    );
    expect(placeholder()).toBeTruthy();
    drawn();
    act(() =>
      editor.setSelection({
        anchor: { blockId: "b", offset: 0 },
        head: { blockId: "b", offset: 0 },
      }),
    );
    expect(placeholder()).toBeNull();
    expect(drawn()).toEqual(["b"]);
  });

  it("draws every block again when the editor becomes read-only", () => {
    act(() => root.render(<EditorContent editor={editor} afterText={afterText} />));
    drawn();
    act(() => editor.setEditable(false));
    expect(drawn()).toEqual(["a", "b", "i1", "i2", "i3", "title"]);
  });

  it("draws a decorated block again, and once more when the decoration goes", () => {
    act(() => root.render(<EditorContent editor={editor} afterText={afterText} />));
    drawn();
    act(() =>
      editor.setDecorations("test", [
        { type: "inline", key: "k", blockId: "b", from: 0, to: 2, className: "mark" },
      ]),
    );
    expect(drawn()).toEqual(["b"]);
    expect(container.querySelector("[data-block-id=b] .mark")?.textContent).toBe("La");
    act(() => editor.setDecorations("test", []));
    expect(drawn()).toEqual(["b"]);
    expect(container.querySelector("[data-block-id=b] .mark")).toBeNull();
  });

  it("draws a decorated block again only when its own decorations change", () => {
    act(() => root.render(<EditorContent editor={editor} afterText={afterText} />));
    const mark = (blockId: string, to: number) =>
      ({ type: "inline", key: blockId, blockId, from: 0, to, className: "mark" }) as const;
    const kept = [mark("a", 2), mark("i3", 2)];
    act(() => editor.setDecorations("kept", kept));
    act(() => editor.setDecorations("moving", [mark("b", 1)]));
    drawn();
    // another layer changes: the blocks of the layer that stays are not drawn again
    act(() => editor.setDecorations("moving", [mark("b", 3)]));
    expect(drawn()).toEqual(["b"]);
    expect(container.querySelector("[data-block-id=b] .mark")?.textContent).toBe("Las");
    // the same decorations given again draw nothing, and neither does typing elsewhere
    act(() => editor.setDecorations("kept", kept));
    expect(drawn()).toEqual([]);
    type("title", "x");
    expect(drawn()).toEqual(["title"]);
    expect(container.querySelector("[data-block-id=i3] .mark")?.textContent).toBe("Th");
    // a decoration that is a new object is a new decoration
    act(() => editor.setDecorations("kept", [mark("a", 2), kept[1]!]));
    expect(drawn()).toEqual(["a"]);
  });

  it("draws of a growing group of suggested blocks only the blocks that are new objects", () => {
    const seenPhantoms: string[] = [];
    const paragraph = ({ rootProps, content, block: view, phantom }: BlockViewProps) => {
      if (phantom) seenPhantoms.push(view.id);
      return <p {...rootProps}>{content}</p>;
    };
    paragraph.pure = true;
    act(() => root.render(<EditorContent editor={editor} blockViews={{ paragraph }} />));
    const suggested = (id: string, value: string): BlockView => ({
      id,
      type: "paragraph",
      attrs: {},
      content: text(value),
      children: [],
      decorations: [],
    });
    const attrs = { "data-proposal": "p" };
    const style = { "--track": "red" };
    const group = (blocks: BlockView[], className = "suggested") =>
      ({
        type: "blocks",
        key: "g",
        blockId: "a",
        position: "after",
        blocks,
        className,
        attrs,
        style,
      }) as const;
    const one = suggested("n1", "One");
    act(() => editor.setDecorations("review", [group([one, suggested("n2", "Tw")])]));
    expect(seenPhantoms.splice(0)).toEqual(["n1", "n2"]);
    // the text grows: the first block is the same object, the last is new, one more comes
    act(() =>
      editor.setDecorations("review", [
        group([one, suggested("n2", "Two"), suggested("n3", "Three")]),
      ]),
    );
    expect(seenPhantoms.splice(0)).toEqual(["n2", "n3"]);
    const texts = () =>
      [...container.querySelectorAll("[data-gotipe-phantom-id]")].map((element) => [
        element.textContent,
        element.className,
        element.getAttribute("data-proposal"),
      ]);
    expect(texts()).toEqual([
      ["One", "suggested", "p"],
      ["Two", "suggested", "p"],
      ["Three", "suggested", "p"],
    ]);
    // typing elsewhere draws none of them again
    type("b", "x");
    expect(seenPhantoms.splice(0)).toEqual([]);
    // the group's look changes: every block of it is drawn with the new class
    const two = suggested("n2", "Two");
    act(() => editor.setDecorations("review", [group([one, two], "suggested is-active")]));
    expect(seenPhantoms.splice(0)).toEqual(["n1", "n2"]);
    expect(texts().map((row) => row[1])).toEqual(["suggested is-active", "suggested is-active"]);
  });

  it("draws a suggested block with a custom view on every change, like any block with one", () => {
    let quotes = 0;
    // a view that is not `pure` may read the editor as it draws: it is never passed over
    const blockquote = ({ rootProps, content }: BlockViewProps) => {
      quotes += 1;
      return <blockquote {...rootProps}>{content}</blockquote>;
    };
    const views = { blockquote };
    act(() =>
      root.render(<EditorContent editor={editor} afterText={afterText} blockViews={views} />),
    );
    act(() =>
      editor.setDecorations("review", [
        {
          type: "blocks",
          key: "g",
          blockId: "a",
          position: "after",
          blocks: [
            {
              id: "q",
              type: "blockquote",
              attrs: {},
              content: text("Quoted"),
              children: [],
              decorations: [],
            },
          ],
        },
      ]),
    );
    expect(quotes).toBe(1);
    drawn();
    type("b", "x");
    expect(quotes).toBe(2);
    // the block it stands after is a plain one: it is not drawn with it
    expect(drawn()).toEqual(["b"]);
    // a host that draws again draws it again too, and no plain block
    act(() =>
      root.render(<EditorContent editor={editor} afterText={afterText} blockViews={views} />),
    );
    expect(quotes).toBe(3);
    expect(drawn()).toEqual([]);
  });

  it("draws a block with a custom view, and the blocks over it, on every change", () => {
    let titles = 0;
    let items = 0;
    const blockViews = {
      // a view may read the editor as it draws: it is never skipped
      heading: ({ rootProps, content, editor: current }: BlockViewProps) => {
        titles += 1;
        return (
          <h2 {...rootProps} data-blocks={current.getViewState().blocks.length}>
            {content}
          </h2>
        );
      },
      listItem: ({ rootProps, content, children }: BlockViewProps) => {
        items += 1;
        return (
          <li {...rootProps}>
            {content}
            {children}
          </li>
        );
      },
    };
    act(() =>
      root.render(<EditorContent editor={editor} afterText={afterText} blockViews={blockViews} />),
    );
    expect([titles, items]).toEqual([1, 3]);
    drawn();
    type("a", "x");
    expect([titles, items]).toEqual([2, 6]);
    expect(drawn()).toEqual(["a", "i1", "i2", "i3", "title"]);
    act(() => {
      editor.dispatch({ steps: [{ type: "deleteBlock", blockId: "b" }] });
    });
    expect(container.querySelector("[data-block-id=title]")?.getAttribute("data-blocks")).toBe("4");
  });
});
