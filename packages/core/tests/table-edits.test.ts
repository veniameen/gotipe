// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import fixture from "../../../crates/gotipe-core/tests/fixtures/table-edits.json";
import { DefaultPreset } from "../src/presets";
import { tableGrid } from "../src/table/grid";
import { type TableEdit, editTable } from "../src/tables";
import type { Block, TextSpan } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { ENGINES, block, createOn, doc, text } from "./engines";

interface Case {
  id: string;
  table: keyof typeof fixture.tables;
  colWidths?: number[];
  edit: TableEdit;
  expect: {
    grid?: string[][];
    kinds?: string[];
    text?: Record<string, string>;
    caret?: [string, number];
    colWidths?: number[] | null;
    /** Stored span attributes after the edit: a repaired span is written as drawn. */
    stored?: Record<string, Record<string, number>>;
    error?: string;
    removed?: boolean;
  };
}

/** The same compact form the Rust suite reads: `id:text|colspan|rowspan`, `#` for a header. */
export function fixtureTable(rows: string[][], colWidths?: number[]): Block {
  return block(
    "t",
    "table",
    null,
    colWidths ? { colWidths } : {},
    rows.map((cells, index) =>
      block(
        `r${index}`,
        "tableRow",
        null,
        {},
        cells.map((spec) => {
          const [head, colspan, rowspan] = spec.replace(/^#/, "").split("|");
          const [id, value = ""] = head!.split(":");
          const attrs: Block["attrs"] = {};
          if (colspan) attrs.colspan = Number(colspan);
          if (rowspan) attrs.rowspan = Number(rowspan);
          return block(id!, spec.startsWith("#") ? "tableHeader" : "tableCell", text(value), attrs);
        }),
      ),
    ),
  );
}

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe.each(ENGINES)("shared table edits on the %s engine", (engine) => {
  it.each(fixture.cases as Case[])("$id", async (entry) => {
    const editor = await createOn(engine, {
      extensions: DefaultPreset,
      content: doc(fixtureTable(fixture.tables[entry.table], entry.colWidths)),
    });
    editors.push(editor);
    const original = editor.getJSON();
    if (entry.expect.error) {
      expect(() => editTable(editor, "t", entry.edit)).toThrow(entry.expect.error);
      expect(editor.getJSON()).toEqual(original);
      return;
    }
    expect(editTable(editor, "t", entry.edit)).toBe(true);
    const table = editor.getJSON().blocks.find((item) => item.id === "t");
    if (entry.expect.removed) {
      expect(table).toBeUndefined();
    } else {
      const grid = tableGrid(table!);
      expect(grid.problem).toBeNull();
      const known = new Set(
        original.blocks[0]!.children.flatMap((row) => row.children.map((cell) => cell.id)),
      );
      const at = (row: number, column: number) => grid.at(row, column);
      if (entry.expect.grid)
        expect(
          Array.from({ length: grid.rows }, (_, row) =>
            Array.from({ length: grid.columns }, (_, column) => {
              const cell = at(row, column);
              return !cell ? "-" : known.has(cell.node.id) ? cell.node.id : "new";
            }),
          ),
        ).toEqual(entry.expect.grid);
      if (entry.expect.kinds)
        expect(
          Array.from({ length: grid.rows }, (_, row) =>
            Array.from({ length: grid.columns }, (_, column) =>
              at(row, column)?.node.type === "tableHeader" ? "h" : "c",
            ).join(""),
          ),
        ).toEqual(entry.expect.kinds);
      for (const [id, value] of Object.entries(entry.expect.text ?? {}))
        expect((grid.find(id)!.node.content as TextSpan[]).map((span) => span.text).join("")).toBe(
          value,
        );
      for (const [id, attrs] of Object.entries(entry.expect.stored ?? {}))
        for (const [name, value] of Object.entries(attrs))
          expect(grid.find(id)!.node.attrs[name]).toBe(value);
      if (entry.expect.colWidths !== undefined)
        expect(table!.attrs.colWidths ?? null).toEqual(entry.expect.colWidths);
      if (entry.expect.caret)
        expect(editor.getViewState().selection.anchor).toEqual({
          blockId: entry.expect.caret[0],
          offset: entry.expect.caret[1],
        });
    }
    // every edit is one undo step
    expect(editor.undo()).toBe(true);
    expect(editor.getJSON().blocks).toEqual(original.blocks);
  });
});
