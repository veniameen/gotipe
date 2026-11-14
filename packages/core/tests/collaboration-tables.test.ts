// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import fixture from "../../../crates/gotipe-core/tests/fixtures/table-edits.json";
import { DefaultPreset } from "../src/presets";
import { tableGrid } from "../src/table/grid";
import { type TableEdit, editTable } from "../src/tables";
import type { Block } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { block, createOn, doc, text } from "./engines";

/** Rows of `id:text|colspan|rowspan` cells, `#` for a header (crates/gotipe-core fixtures). */
function table(rows: string[][]): Block {
  return block(
    "t",
    "table",
    null,
    {},
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
const frame = () => table((fixture as { tables: Record<string, string[][]> }).tables.frame!);
const grid3 = () =>
  table([0, 1, 2].map((y) => [0, 1, 2].map((x) => `${y === 0 ? "#" : ""}c${y}${x}:${y}${x}`)));

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
async function replicas(content: Block, ...peers: string[]): Promise<GoTipeEditor[]> {
  return Promise.all(
    peers.map(async (peer) => {
      const editor = await createOn("wasm", { extensions: DefaultPreset, content: doc(content) });
      editor.enableCollaboration(peer);
      editors.push(editor);
      return editor;
    }),
  );
}
/** Every replica receives every other's full state, in both directions, twice. */
function exchange(peers: GoTipeEditor[]) {
  for (let round = 0; round < 2; round++)
    for (const from of peers)
      for (const to of peers)
        if (from !== to) to.receiveCollaborationUpdate(from.getCollaborationUpdate());
}
/** JSON with sorted keys: block attributes are a map, their key order is not content. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
function expectConvergedValidTable(peers: GoTipeEditor[]) {
  const json = peers.map((editor) => canonical(editor.getJSON().blocks));
  expect(new Set(json).size).toBe(1);
  const blocks = peers[0]!.getJSON().blocks;
  // Rows and cells of a deleted row never surface as top-level blocks.
  expect(blocks.map((b) => b.type)).toEqual(["table"]);
  const grid = tableGrid(blocks[0]!);
  expect(grid.problem).toBeFalsy();
  // Every position has a cell: no ragged rows.
  for (let row = 0; row < grid.rows; row++)
    for (let column = 0; column < grid.columns; column++)
      expect(grid.at(row, column), `cell at ${row},${column}`).toBeTruthy();
}

describe("concurrent table edits that delete a row", () => {
  it("keep syncing when a column is inserted into a row deleted meanwhile", async () => {
    const [a, b] = await replicas(grid3(), "a", "b");
    editTable(a, "t", { type: "insertColumn", index: 1 });
    editTable(b, "t", { type: "deleteRow", index: 2 });
    exchange([a!, b!]);
    expectConvergedValidTable([a!, b!]);
    // Editing goes on after the merge.
    a!.dispatch({
      steps: [{ type: "insertText", blockId: "c00", offset: 0, text: "x", marks: [] }],
    });
    exchange([a!, b!]);
    expectConvergedValidTable([a!, b!]);
  });

  const pairs: [TableEdit, TableEdit][] = [
    [
      { type: "deleteRow", index: 2 },
      { type: "deleteRow", index: 3 },
    ],
    [
      { type: "splitCell", row: 0, column: 1 },
      { type: "deleteRow", index: 0 },
    ],
    [
      { type: "splitCell", row: 2, column: 3 },
      { type: "deleteRow", index: 3 },
    ],
    [
      { type: "splitCell", row: 2, column: 3 },
      { type: "deleteRow", index: 2, count: 2 },
    ],
  ];
  for (const [first, second] of pairs)
    it(`converge without a schema error: ${JSON.stringify(first)} + ${JSON.stringify(second)}`, async () => {
      const [a, b] = await replicas(frame(), "a", "b");
      editTable(a!, "t", first);
      editTable(b!, "t", second);
      exchange([a!, b!]);
      expectConvergedValidTable([a!, b!]);
    });

  it("converge on three replicas", async () => {
    const [a, b, c] = await replicas(frame(), "a", "b", "c");
    editTable(a!, "t", { type: "splitCell", row: 2, column: 3 });
    editTable(b!, "t", { type: "deleteRow", index: 3 });
    editTable(c!, "t", { type: "insertColumn", index: 2 });
    exchange([a!, b!, c!]);
    expectConvergedValidTable([a!, b!, c!]);
  });

  const broken: [TableEdit, TableEdit][] = [
    [
      { type: "mergeCells", from: { row: 3, column: 0 }, to: { row: 4, column: 1 } },
      { type: "deleteRow", index: 4 },
    ],
    [
      { type: "mergeCells", from: { row: 3, column: 0 }, to: { row: 4, column: 1 } },
      { type: "deleteColumn", index: 1, count: 2 },
    ],
    [
      { type: "deleteRow", index: 2 },
      { type: "insertRow", index: 3 },
    ],
    [
      { type: "splitCell", row: 0, column: 0 },
      { type: "deleteRow", index: 0 },
    ],
    [
      { type: "mergeCells", from: { row: 2, column: 2 }, to: { row: 3, column: 3 } },
      { type: "insertRow", index: 3 },
    ],
  ];
  for (const [first, second] of broken)
    it(`repair the grid on every replica: ${JSON.stringify(first)} + ${JSON.stringify(second)}`, async () => {
      const [a, b, c] = await replicas(frame(), "a", "b", "c");
      editTable(a!, "t", first);
      editTable(b!, "t", second);
      exchange([a!, b!, c!]);
      expectConvergedValidTable([a!, b!, c!]);
      // The repair is no edit of the user's: nothing to undo on a replica that only received.
      expect(c!.getViewState().toolbar.canUndo).toBe(false);
      // The table can be edited again.
      expect(editTable(c!, "t", { type: "insertRow", index: 1 })).toBe(true);
      exchange([a!, b!, c!]);
      expectConvergedValidTable([a!, b!, c!]);
    });
});
