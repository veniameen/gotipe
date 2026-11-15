// @vitest-environment jsdom
import type { Block } from "@gotipe/core";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleTargets } from "./block-interaction";
import { BlockToolbar } from "./block-toolbar";

let container: HTMLDivElement;
let root: Root;
let editor: GoTipeEditor;

const row = (id: string, text: string, marks: Block["content"] = null): Block => ({
  id,
  type: "listItem",
  attrs: {},
  content: marks ?? [{ text, marks: [] }],
  children: [],
});

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
          id: "L",
          type: "bulletList",
          attrs: {},
          content: null,
          children: [
            row("a", "one"),
            row("b", "", [
              { text: "two", marks: [{ type: "bold", attrs: {} }] },
              { text: " words", marks: [{ type: "italic", attrs: {} }] },
            ]),
            row("d", "four"),
          ],
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

/** The handle of row `b` (Atlas frame 8): the grip moves the row, Alt-drag the list. */
function chooseOnRowB(label: string) {
  act(() =>
    root.render(
      <BlockToolbar
        editor={editor}
        blockId="L"
        addBlockId="b"
        dragBlockId="b"
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />,
    ),
  );
  act(() => container.querySelector<HTMLButtonElement>("[data-gotipe-drag-handle]")!.click());
  const item = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (button) => button.textContent === label,
  );
  expect(item, label).toBeDefined();
  act(() => item!.click());
}
const texts = (blocks: Block[]) =>
  blocks.map((block) => (block.content as { text: string }[]).map((span) => span.text).join(""));

describe("the block menu of a list row acts on that row", () => {
  it("deletes the row, not the list", () => {
    chooseOnRowB("Delete");
    const [list] = editor.getJSON().blocks as Block[];
    expect(list!.id).toBe("L");
    expect(texts(list!.children)).toEqual(["one", "four"]);
  });

  it("duplicates the row inside its list", () => {
    chooseOnRowB("Duplicate");
    const blocks = editor.getJSON().blocks as Block[];
    expect(blocks).toHaveLength(1);
    expect(texts(blocks[0]!.children)).toEqual(["one", "two words", "two words", "four"]);
  });

  it("resets the row to plain text, marks removed, in one undo step", () => {
    const before = editor.getJSON();
    chooseOnRowB("Reset Formatting");
    const blocks = editor.getJSON().blocks as Block[];
    expect(blocks.map((block) => block.type)).toEqual(["bulletList", "paragraph", "bulletList"]);
    expect(blocks[1]).toMatchObject({
      id: "b",
      content: [{ text: "two words", marks: [] }],
    });
    editor.undo();
    expect(editor.getJSON()).toEqual(before);
  });
});

describe("the handle of a block inside a list row acts on that row", () => {
  it("gives +, the grip and the menu the row; Alt-drag keeps the whole list", () => {
    // jsdom has no `CSS.escape`.
    (globalThis as { CSS?: { escape(value: string): string } }).CSS ??= {
      escape: (value) => value.replace(/["\\\]]/g, "\\$&"),
    };
    const root = document.createElement("div");
    root.innerHTML = [
      "<div data-gotipe-content>",
      '<ul data-block-id="L" data-block-type="bulletList">',
      '<li data-block-id="b" data-block-type="listItem">two',
      '<p data-block-id="c" data-block-type="paragraph">more</p></li></ul>',
      '<div data-block-id="C" data-block-type="columns"><div data-block-id="K" data-block-type="column">',
      '<p data-block-id="k" data-block-type="paragraph">left</p></div></div>',
      "</div>",
    ].join("");
    const row = { actionBlockId: "L", addBlockId: "b", dragBlockId: "b" };
    expect(handleTargets(root, "c")).toEqual(row);
    expect(handleTargets(root, "b")).toEqual(row);
    // Outside lists the unit stays the top-level block.
    expect(handleTargets(root, "k")).toEqual({
      actionBlockId: "C",
      addBlockId: "C",
      dragBlockId: "C",
    });
  });
});
