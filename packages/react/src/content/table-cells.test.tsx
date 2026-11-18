// @vitest-environment jsdom
import type { Block } from "@gotipe/core";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditorContent } from "../editor-content";

let container: HTMLDivElement;
let root: Root;
let editor: GoTipeEditor;
const cell = (id: string, attrs: Block["attrs"] = {}, header = false): Block => ({
  id,
  type: header ? "tableHeader" : "tableCell",
  attrs,
  content: [{ text: id, marks: [] }],
  children: [],
});
const row = (id: string, cells: Block[]): Block => ({
  id,
  type: "tableRow",
  attrs: {},
  content: null,
  children: cells,
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
          id: "t",
          type: "table",
          attrs: { colWidths: [100, 120, 140] },
          content: null,
          children: [
            row("r0", [cell("a", { rowspan: 2 }, true), cell("b", { colspan: 2 }, true)]),
            row("r1", [cell("c", {}, true), cell("d", {}, true)]),
            row("r2", [cell("e"), cell("f", { colspan: 2, rowspan: 2 })]),
            row("r3", [cell("g")]),
          ],
        },
      ],
    },
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  editor.destroy();
});

describe("merged cells in the MIT renderer", () => {
  it("draws spans, a two-row head, one column per grid column and Tab skips nothing", () => {
    act(() => root.render(<EditorContent editor={editor} />));
    const at = (id: string) =>
      container.querySelector<HTMLTableCellElement>(`[data-block-id="${id}"]`)!;
    expect(at("a").tagName).toBe("TH");
    expect(at("a").rowSpan).toBe(2);
    expect(at("b").colSpan).toBe(2);
    expect(at("f").colSpan).toBe(2);
    expect(at("f").rowSpan).toBe(2);
    expect(container.querySelectorAll("thead > tr")).toHaveLength(2);
    expect(container.querySelectorAll("tbody > tr")).toHaveLength(2);
    expect([...container.querySelectorAll("col")].map((col) => col.style.width)).toEqual([
      "100px",
      "120px",
      "140px",
    ]);
    expect(at("c").closest("tr")!.classList.contains("is-continued")).toBe(true);
    // Tab walks the cells in reading order; covered positions have no cell to stop at
    editor.setSelection({ anchor: { blockId: "e", offset: 0 }, head: { blockId: "e", offset: 0 } });
    editor.chain().goToNextCell().run();
    expect(editor.getViewState().selection.anchor.blockId).toBe("f");
    editor.chain().goToNextCell().run();
    expect(editor.getViewState().selection.anchor.blockId).toBe("g");
  });
});

describe("column widths in the MIT renderer", () => {
  const plain = (id: string, attrs: Block["attrs"] = {}): Promise<GoTipeEditor> =>
    createEditor({
      extensions: [FullPreset],
      content: {
        version: 1,
        blocks: [
          {
            id,
            type: "table",
            attrs,
            content: null,
            children: [
              row("p0", [cell("h1", {}, true), cell("h2", {}, true), cell("h3", {}, true)]),
              row("p1", [cell("x1"), cell("x2"), cell("x3")]),
            ],
          },
        ],
      },
    });
  const table = () => container.querySelector<HTMLTableElement>("table")!;
  const cols = () => [...container.querySelectorAll("col")].map((col) => col.style.width);
  const widthsOf = (target: GoTipeEditor) => target.getJSON().blocks[0]!.attrs.colWidths;
  /** Draws every column `width` px wide, as a browser lays out the shared columns. */
  const drawColumns = (width: number) => {
    for (const col of container.querySelectorAll("col"))
      col.getBoundingClientRect = () => ({ width }) as DOMRect;
  };
  const pointer = (type: string, clientX: number, target: EventTarget = window) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
    Object.defineProperty(event, "pointerId", { value: 1 });
    act(() => {
      target.dispatchEvent(event);
    });
  };
  const handleOf = (id: string) =>
    container
      .querySelector(`[data-block-id="${id}"]`)!
      .querySelector<HTMLButtonElement>(".gotipe-table-col-resize")!;
  let own: GoTipeEditor;
  afterEach(() => own.destroy());

  it("shares the text column among columns without a stored width, no fixed 160 px", async () => {
    own = await plain("w");
    act(() => root.render(<EditorContent editor={own} />));
    expect(cols()).toEqual(["", "", ""]);
    expect(table().classList.contains("gotipe-table-shared")).toBe(true);
    expect(table().style.getPropertyValue("--gt-table-fixed")).toBe("0px");
    expect(table().style.getPropertyValue("--gt-table-shared")).toBe("3");
    expect(container.innerHTML).not.toContain("160px");
  });

  it("keeps stored widths as stored and shares the rest with the columns that have none", async () => {
    own = await plain("w", { colWidths: [100, 120, 140] });
    act(() => root.render(<EditorContent editor={own} />));
    expect(cols()).toEqual(["100px", "120px", "140px"]);
    expect(table().className).toBe("gotipe-table");
    expect(table().getAttribute("style")).toBeNull();
    act(() => root.render(<div />));
    own.destroy();
    own = await plain("w", { colWidths: [100] });
    act(() => root.render(<EditorContent editor={own} />));
    expect(cols()).toEqual(["100px", "", ""]);
    expect(table().style.getPropertyValue("--gt-table-fixed")).toBe("100px");
    expect(table().style.getPropertyValue("--gt-table-shared")).toBe("2");
  });

  it("resizes a shared column from its drawn width and keeps the others shared", async () => {
    own = await plain("w");
    act(() => root.render(<EditorContent editor={own} />));
    drawColumns(149);
    pointer("pointerdown", 300, handleOf("h3"));
    pointer("pointermove", 351);
    // the drag shows the new width; the other columns still share the rest
    expect(cols()).toEqual(["", "", "200px"]);
    pointer("pointerup", 351);
    expect(widthsOf(own)).toEqual([null, null, 200]);
    expect(cols()).toEqual(["", "", "200px"]);
    expect(table().style.getPropertyValue("--gt-table-fixed")).toBe("200px");
    expect(table().style.getPropertyValue("--gt-table-shared")).toBe("2");
    // one undo step brings the shared table back
    act(() => {
      own.undo();
    });
    expect(widthsOf(own)).toBeUndefined();
    // the keyboard steps from the drawn width as well
    drawColumns(149);
    act(() => {
      handleOf("h1").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(widthsOf(own)).toEqual([165, null, null]);
  });

  it("resizes a table of stored widths as before", async () => {
    own = await plain("w", { colWidths: [100, 120, 140] });
    act(() => root.render(<EditorContent editor={own} />));
    pointer("pointerdown", 300, handleOf("h2"));
    pointer("pointermove", 330);
    pointer("pointerup", 330);
    // jsdom draws nothing: the drag starts from the stored width
    expect(widthsOf(own)).toEqual([100, 150, 140]);
  });
});
