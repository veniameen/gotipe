// @vitest-environment jsdom
import { type GoTipeEditor, createEditor, defineExtension } from "@gotipe/core/js";
import { DefaultPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditorContent } from "../editor-content";

/** A host's block that holds other blocks and has no React view of its own. */
const Note = defineExtension({
  name: "note",
  nodes: [
    {
      name: "note",
      group: ["block"],
      content: "richText",
      attrs: {},
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: true,
    },
  ],
});
const text = (value: string) => [{ text: value, marks: [] }];

let editor: GoTipeEditor;
let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  editor = await createEditor({
    extensions: [DefaultPreset, Note],
    content: {
      version: 1,
      blocks: [
        {
          id: "note",
          type: "note",
          attrs: {},
          content: text("Release notes"),
          children: [
            {
              id: "child",
              type: "paragraph",
              attrs: {},
              content: text("Кириллица 😀"),
              children: [],
            },
          ],
        },
        { id: "bare", type: "note", attrs: {}, content: text("No children"), children: [] },
        { id: "body", type: "paragraph", attrs: {}, content: text("Body"), children: [] },
      ],
    },
  });
  editor.setEditable(false);
  act(() => root.render(<EditorContent editor={editor} />));
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
});

describe("a block type without a view (D-31)", () => {
  it("keeps its children inside it", () => {
    const note = container.querySelector('[data-block-id="note"]')!;
    expect(note.tagName).toBe("DIV");
    expect(note.getAttribute("data-block-type")).toBe("note");
    const child = note.querySelector('[data-block-id="child"]');
    expect(child?.tagName).toBe("P");
    expect(child?.textContent).toBe("Кириллица 😀");
    expect(note.textContent).toBe("Release notesКириллица 😀");
  });

  it("keeps the same `<p>` without children", () => {
    expect(container.querySelector('[data-block-id="bare"]')?.outerHTML).toBe(
      '<p data-block-id="bare" data-block-type="note">No children</p>',
    );
    expect(container.querySelector('[data-block-id="body"]')?.outerHTML).toBe(
      '<p data-block-id="body" dir="auto" data-block-type="paragraph">Body</p>',
    );
  });
});

describe("an ordered list (D-268)", () => {
  const list = (id: string, attrs: Record<string, unknown>) => ({
    id,
    type: "orderedList",
    attrs,
    content: null,
    children: [{ id: `${id}-item`, type: "listItem", attrs: {}, content: text(id), children: [] }],
  });

  it("counts from its own number", () => {
    act(() =>
      editor.setContent({
        version: 1,
        blocks: [list("from-99", { start: 99 }), list("from-0", { start: 0 }), list("from-1", {})],
      }),
    );
    expect(container.querySelector('[data-block-id="from-99"]')?.getAttribute("start")).toBe("99");
    expect(container.querySelector('[data-block-id="from-0"]')?.getAttribute("start")).toBe("0");
    expect(container.querySelector('[data-block-id="from-1"]')?.hasAttribute("start")).toBe(false);
  });

  it("gives a number of three digits or more its room (D-269)", () => {
    act(() =>
      editor.setContent({
        version: 1,
        blocks: [
          list("from-99", { start: 99 }),
          list("from-100", { start: 100 }),
          list("from-1", {}),
        ],
      }),
    );
    const digits = (id: string) =>
      container
        .querySelector<HTMLElement>(`[data-block-id="${id}"]`)
        ?.style.getPropertyValue("--gt-list-digits");
    expect(digits("from-99")).toBe("");
    expect(digits("from-100")).toBe("3");
    expect(digits("from-1")).toBe("");
  });
});
