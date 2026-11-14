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
