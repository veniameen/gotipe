// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { copySelection } from "../src/clipboard/selection";
import { parseHtmlDocument } from "../src/html";
import { DefaultPreset } from "../src/presets";
import { tableGrid } from "../src/table/grid";
import { normalizeTableGeometry, repairTable } from "../src/table/repair";
import { editTable } from "../src/tables";
import type { Block, Document } from "../src/types/block";
import { ENGINES, block, createOn, doc, text } from "./engines";

const cell = (id: string, attrs: Block["attrs"] = {}, header = false) =>
  block(id, header ? "tableHeader" : "tableCell", text(id), attrs);
const table = (...rows: Block[][]) =>
  block(
    "t",
    "table",
    null,
    {},
    rows.map((cells, index) => block(`r${index}`, "tableRow", null, {}, cells)),
  );
/** Applies steps the way both engines would, on a copy (enough for structure checks). */
function shape(value: Block) {
  const grid = tableGrid(value);
  return Array.from({ length: grid.rows }, (_, row) =>
    Array.from({ length: grid.columns }, (_, column) => {
      const id = grid.at(row, column)?.node.id ?? "-";
      return id.length > 4 ? "new" : id;
    }),
  );
}

describe("table geometry repair", () => {
  it("lays out a span past the last row or over a cell from above as browsers draw it", () => {
    const grid = tableGrid(table([cell("a", { rowspan: 2 }, true), cell("b", { colspan: 2.7 })]));
    expect(grid.problem).toMatch(/last row/);
    expect(grid.find("a")!.rows).toBe(1);
    expect(grid.find("b")!.columns).toBe(1);
    const overlap = tableGrid(
      table([cell("a"), cell("b", { rowspan: 2 })], [cell("c", { colspan: 2 })]),
    );
    expect(overlap.problem).toMatch(/overlap/);
    expect(overlap.find("c")!.columns).toBe(1);
    // the shared span rule: whole numbers from 1 to 1000, anything else is 1
    const limits = tableGrid(table([cell("x", { colspan: 1001 }), cell("y", { colspan: 1000 })]));
    expect(limits.find("x")!.columns).toBe(1);
    expect(limits.find("y")!.columns).toBe(1000);
  });

  it("repairs a table without new IDs unless a position has no cell", () => {
    const broken = table([cell("x"), cell("b", { rowspan: 3 })], [cell("c", { colspan: 2 })]);
    const repaired = repairTable(broken, { fill: false });
    expect(tableGrid(repaired).problem).toBeNull();
    expect(repaired.children[0]!.children[1]!.attrs.rowspan).toBe(2);
    expect(repaired.children[1]!.children[0]!.attrs.colspan).toBe(1);
    expect(shape(repaired)).toEqual([
      ["x", "b"],
      ["c", "b"],
    ]);
    const valid = table([cell("a"), cell("b")]);
    expect(repairTable(valid)).toBe(valid);
  });

  it.each(ENGINES)(
    "normalizeTableGeometry returns repair steps the %s engine applies",
    async (engine) => {
      const content = doc(
        block("p", "paragraph", text("x")),
        table([cell("x"), cell("b", { rowspan: 3 }), cell("e")], [cell("c", { colspan: 2 })]),
      );
      const editor = await createOn(engine, { extensions: DefaultPreset, content });
      let next = 0;
      const steps = normalizeTableGeometry(editor.getJSON(), { createId: () => `fill${next++}` });
      expect(steps.length).toBeGreaterThan(0);
      expect(editor.dispatch({ steps })).toBe(true);
      const repaired = editor.getJSON().blocks[1]!;
      expect(tableGrid(repaired).problem).toBeNull();
      expect(shape(repaired)).toEqual([
        ["x", "b", "e"],
        ["c", "b", "new"],
      ]);
      expect(tableGrid(repaired).at(1, 2)!.node.id).toBe("fill0");
      // nothing left to repair, and a valid document gives no steps
      expect(normalizeTableGeometry(editor.getJSON())).toEqual([]);
      // the repaired table takes edits again
      expect(editTable(editor, "t", { type: "insertRow", index: 2 })).toBe(true);
      editor.destroy();
    },
  );

  it("cuts the spans of an imported HTML table and of a copied row", () => {
    const imported = parseHtmlDocument(
      '<table><tr><th rowspan="2">A</th><th colspan="5000">B</th></tr></table>',
    ).blocks[0]!;
    expect(imported.type).toBe("table");
    expect(tableGrid(imported).problem).toBeNull();
    expect(imported.children[0]!.children.map((item) => item.attrs.rowspan)).toEqual([1, 1]);
    expect(imported.children[0]!.children[1]!.attrs.colspan).toBe(1);

    const source: Document = doc(table([cell("a", { rowspan: 2 }), cell("b")], [cell("c")]));
    const copied = copySelection(source, {
      type: "text",
      anchor: { blockId: "a", offset: 0 },
      head: { blockId: "b", offset: 1 },
    });
    const clipped = (copied as { blocks: Block[] }).blocks[0]!;
    expect(clipped.children).toHaveLength(1);
    expect(tableGrid(clipped).problem).toBeNull();
    expect(clipped.children[0]!.children[0]!.attrs.rowspan).toBe(1);
  });
});
