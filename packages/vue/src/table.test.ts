// @vitest-environment jsdom
import type { Block } from "@gotipe/core";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { afterEach, describe, expect, it } from "vitest";
import { type App, createApp, h, nextTick, shallowRef } from "vue";
import { EditorContent } from "./editor-content";

const apps: App[] = [];
const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});
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

describe("Vue table renderer", () => {
  it("draws merged cells, the header rows in the head and the column widths", async () => {
    const editor = await createEditor({
      extensions: [FullPreset],
      engine: "js",
      content: {
        version: 1,
        blocks: [
          {
            id: "t",
            type: "table",
            attrs: { colWidths: [90] },
            content: null,
            children: [
              row("r0", [cell("a", { rowspan: 2 }, true), cell("b", { colspan: 2 }, true)]),
              row("r1", [cell("c", {}, true), cell("d", {}, true)]),
              row("r2", [cell("e"), cell("f", { colspan: 2, rowspan: 0 })]),
            ],
          },
        ],
      },
    });
    editors.push(editor);
    const root = document.createElement("div");
    document.body.append(root);
    const app = createApp({ setup: () => () => h(EditorContent, { editor: shallowRef(editor) }) });
    apps.push(app);
    app.mount(root);
    await nextTick();
    const at = (id: string) => root.querySelector<HTMLTableCellElement>(`[data-block-id="${id}"]`)!;
    expect(at("a").rowSpan).toBe(2);
    expect(at("b").colSpan).toBe(2);
    // a stored span is read as the grid reads it: zero counts as one
    expect(at("f").colSpan).toBe(2);
    expect(at("f").rowSpan).toBe(1);
    expect(root.querySelectorAll("thead > tr")).toHaveLength(2);
    expect(root.querySelectorAll("tbody > tr")).toHaveLength(1);
    expect([...root.querySelectorAll("col")].map((col) => col.style.width)).toEqual([
      "90px",
      "160px",
      "160px",
    ]);
  });
});
