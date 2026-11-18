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
