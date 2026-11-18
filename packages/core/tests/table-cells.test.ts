// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { DefaultPreset } from "../src/presets";
import { cellRange, tableGrid } from "../src/table/grid";
import { editTable } from "../src/tables";
import type { Block, TextSpan } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { ENGINES, type Engine, block, createOn, doc, text } from "./engines";

const bold = { type: "bold", attrs: {} };
const cell = (id: string, value: string | TextSpan[], attrs: Block["attrs"] = {}, header = false) =>
  block(
    id,
    header ? "tableHeader" : "tableCell",
    typeof value === "string" ? text(value) : value,
    attrs,
  );
/** Rows of cells; a cell is `id:text`, `id:text|colspan|rowspan`, a header cell starts with `#`. */
function table(rows: string[][], attrs: Block["attrs"] = {}): Block {
  return block(
    "t",
    "table",
    null,
    attrs,
    rows.map((cells, index) =>
      block(
        `r${index}`,
        "tableRow",
        null,
        {},
        cells.map((spec) => {
          const header = spec.startsWith("#");
          const [head, colspan, rowspan] = spec.replace(/^#/, "").split("|");
          const [id, value = ""] = head!.split(":");
          const spans: Block["attrs"] = {};
          if (colspan) spans.colspan = Number(colspan);
          if (rowspan) spans.rowspan = Number(rowspan);
          return cell(id!, value, spans, header);
        }),
      ),
    ),
  );
}
const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
async function open(engine: Engine, rows: string[][], attrs: Block["attrs"] = {}) {
  const editor = await createOn(engine, {
    extensions: DefaultPreset,
    content: doc(table(rows, attrs)),
  });
  editors.push(editor);
  return editor;
}
const stored = (editor: GoTipeEditor) => editor.getJSON().blocks[0]!;
/** The grid as ids by position: what a reader of the rendered table sees. */
function shape(editor: GoTipeEditor): string[][] {
  const grid = tableGrid(stored(editor));
  expect(grid.problem).toBeNull();
  return Array.from({ length: grid.rows }, (_, row) =>
    Array.from({ length: grid.columns }, (_, column) => {
      const at = grid.at(row, column);
      return at ? (at.node.id.length > 8 ? "new" : at.node.id) : "-";
    }),
  );
}
const cellText = (editor: GoTipeEditor, id: string) =>
  (tableGrid(stored(editor)).find(id)!.node.content as TextSpan[])
    .map((span) => span.text)
    .join("");

// The frame-29 table: a header over two columns, two header rows, a body cell over two rows.
const FRAME = [
  ["#p:Платформа||2", "#j:Журнал|2", "#e:Шифрование||2"],
  ["#k:Ключ", "#q:В очереди"],
  ["w:Веб", "wk:drafts.web", "wq:1 284", "ws:Ключ сессии||2"],
  ["m:macOS", "mk:drafts.mac", "mq:312"],
  ["i:iOS", "ik:drafts.ios", "iq:0", "is:Нет"],
];

describe.each(ENGINES)("merged table cells on the %s engine", (engine) => {
  it("lays out spans as HTML does and expands a range over merged cells", async () => {
    const editor = await open(engine, FRAME);
    expect(shape(editor)).toEqual([
      ["p", "j", "j", "e"],
      ["p", "k", "q", "e"],
      ["w", "wk", "wq", "ws"],
      ["m", "mk", "mq", "ws"],
      ["i", "ik", "iq", "is"],
    ]);
    const grid = tableGrid(stored(editor));
    expect(cellRange(grid, { row: 1, column: 1 }, { row: 1, column: 1 })).toEqual({
      top: 1,
      left: 1,
      bottom: 1,
      right: 1,
    });
    expect(cellRange(grid, { row: 0, column: 1 }, { row: 1, column: 1 })).toEqual({
      top: 0,
      left: 1,
      bottom: 1,
      right: 2,
    });
    expect(cellRange(grid, { row: 3, column: 2 }, { row: 3, column: 3 })).toEqual({
      top: 2,
      left: 2,
      bottom: 3,
      right: 3,
    });
  });

  it("merges a rectangle into its top-left cell line by line, as one undo step", async () => {
    const editor = await open(engine, [
      ["a:Один", "b:", "c:Три"],
      ["d:", "e:Пять 😀", "f"],
    ]);
    editor.dispatch({
      steps: [{ type: "addMark", blockId: "e", from: 0, to: 4, mark: bold }],
    });
    const original = editor.getJSON();
    expect(
      editTable(editor, "t", {
        type: "mergeCells",
        from: { row: 0, column: 0 },
        to: { row: 1, column: 1 },
      }),
    ).toBe(true);
    expect(shape(editor)).toEqual([
      ["a", "a", "c"],
      ["a", "a", "f"],
    ]);
    const merged = tableGrid(stored(editor)).find("a")!.node;
    expect(merged.attrs).toMatchObject({ colspan: 2, rowspan: 2 });
    expect(merged.content).toEqual([
      { text: "Один\n", marks: [] },
      { text: "Пять", marks: [bold] },
      { text: " 😀", marks: [] },
    ]);
    expect(editor.getViewState().selection.anchor).toEqual({ blockId: "a", offset: 12 });
    expect(stored(editor).children[1]!.children.map((item) => item.id)).toEqual(["f"]);
    expect(editor.undo()).toBe(true);
    expect(editor.getJSON().blocks).toEqual(original.blocks);
  });

  it("splits a merged cell back to one cell per position, its text staying top-left", async () => {
    const editor = await open(engine, FRAME);
    editTable(editor, "t", { type: "splitCell", row: 0, column: 2 });
    const after = shape(editor);
    expect(after[0]).toEqual(["p", "j", "new", "e"]);
    expect(cellText(editor, "j")).toBe("Журнал");
    const fresh = tableGrid(stored(editor)).at(0, 2)!.node;
    expect(fresh.type).toBe("tableHeader");
    expect(fresh.content).toEqual([]);
    editTable(editor, "t", { type: "splitCell", row: 3, column: 3 });
    expect(shape(editor).map((row) => row[3])).toEqual(["e", "e", "ws", "new", "is"]);
    expect(() => editTable(editor, "t", { type: "splitCell", row: 4, column: 0 })).toThrow(
      /not merged/,
    );
    editor.undo();
    editor.undo();
    expect(shape(editor)[0]).toEqual(["p", "j", "j", "e"]);
  });

  it("refuses a range that cuts a merged cell and a single cell, writing nothing", async () => {
    const editor = await open(engine, FRAME);
    const original = editor.getJSON();
    expect(() =>
      editTable(editor, "t", {
        type: "mergeCells",
        from: { row: 0, column: 1 },
        to: { row: 1, column: 1 },
      }),
    ).toThrow(/merged cell/);
    expect(() =>
      editTable(editor, "t", {
        type: "mergeCells",
        from: { row: 2, column: 1 },
        to: { row: 2, column: 1 },
      }),
    ).toThrow(/two cells/);
    expect(editor.getJSON()).toEqual(original);
    expect(editor.getViewState().toolbar.canUndo).toBe(false);
  });

  it("grows a span when a row or column is inserted through it", async () => {
    const editor = await open(engine, FRAME);
    editTable(editor, "t", { type: "insertRow", index: 3 });
    expect(shape(editor).map((row) => row[3])).toEqual(["e", "e", "ws", "ws", "ws", "is"]);
    expect(shape(editor)[3]!.slice(0, 3)).toEqual(["new", "new", "new"]);
    editTable(editor, "t", { type: "insertColumn", index: 2 });
    expect(shape(editor)[0]).toEqual(["p", "j", "j", "j", "e"]);
    expect(shape(editor)[1]).toEqual(["p", "k", "new", "q", "e"]);
    expect(tableGrid(stored(editor)).at(1, 2)!.node.type).toBe("tableHeader");
    expect(tableGrid(stored(editor)).at(2, 2)!.node.type).toBe("tableCell");
    expect(stored(editor).attrs.colWidths).toBeUndefined();
    editor.undo();
    editor.undo();
    expect(shape(editor)[2]).toEqual(["w", "wk", "wq", "ws"]);
  });

  it("shrinks a span when a row or column through it is deleted, keeping the cell", async () => {
    const editor = await open(engine, FRAME, { colWidths: [100, 120, 140, 160] });
    // the top row of a cell over two rows goes away: the cell moves down with its text
    editTable(editor, "t", { type: "deleteRow", index: 2 });
    expect(shape(editor)).toEqual([
      ["p", "j", "j", "e"],
      ["p", "k", "q", "e"],
      ["m", "mk", "mq", "ws"],
      ["i", "ik", "iq", "is"],
    ]);
    expect(cellText(editor, "ws")).toBe("Ключ сессии");
    expect(tableGrid(stored(editor)).find("ws")!.rows).toBe(1);
    editTable(editor, "t", { type: "deleteColumn", index: 1 });
    expect(shape(editor)[0]).toEqual(["p", "j", "e"]);
    expect(shape(editor)[1]).toEqual(["p", "q", "e"]);
    expect(stored(editor).attrs.colWidths).toEqual([100, 140, 160]);
    // the header row under the tall headers goes; the tall headers shrink
    editTable(editor, "t", { type: "deleteRow", index: 1 });
    expect(shape(editor)[0]).toEqual(["p", "j", "e"]);
    expect(tableGrid(stored(editor)).find("p")!.rows).toBe(1);
    editor.undo();
    editor.undo();
    editor.undo();
    expect(shape(editor)[2]).toEqual(["w", "wk", "wq", "ws"]);
  });

  it("deletes several columns under a merged header as one step", async () => {
    const editor = await open(engine, FRAME);
    editTable(editor, "t", { type: "deleteColumn", index: 1, count: 2 });
    expect(shape(editor)).toEqual([
      ["p", "e"],
      ["p", "e"],
      ["w", "ws"],
      ["m", "ws"],
      ["i", "is"],
    ]);
    // the row under the tall headers has no cell of its own left
    expect(stored(editor).children[1]!.children).toEqual([]);
    editor.undo();
    expect(shape(editor)[0]).toEqual(["p", "j", "j", "e"]);
  });

  it("keeps the header rows on top when a row is added above the first row", async () => {
    const editor = await open(engine, FRAME);
    editTable(editor, "t", { type: "insertRow", index: 0 });
    expect(shape(editor).slice(0, 3)).toEqual([
      ["p", "j", "j", "e"],
      ["p", "k", "q", "e"],
      ["new", "new", "new", "new"],
    ]);
    const plain = await open(engine, [
      ["#h1:A", "#h2:B"],
      ["c1:1", "c2:2"],
    ]);
    editTable(plain, "t", { type: "insertRow", index: 0 });
    expect(stored(plain).children[0]!.id).toBe("r0");
    expect(stored(plain).children[1]!.children.every((item) => item.type === "tableCell")).toBe(
      true,
    );
  });

  it("fills the holes of a short row before a structural edit", async () => {
    const editor = await open(engine, [["a:1", "b:2", "c:3"], ["d:4"]]);
    editTable(editor, "t", { type: "insertColumn", index: 3 });
    expect(shape(editor)).toEqual([
      ["a", "b", "c", "new"],
      ["d", "new", "new", "new"],
    ]);
    // a resize writes widths only
    const resized = await open(engine, [["a:1", "b:2"], ["d:4"]]);
    editTable(resized, "t", { type: "resizeColumn", index: 1, width: 200 });
    expect(stored(resized).children[1]!.children).toHaveLength(1);
    expect(stored(resized).attrs.colWidths).toEqual([null, 200]);
  });

  it("refuses grid positions that are not whole numbers, writing nothing", async () => {
    const editor = await open(engine, FRAME);
    const original = editor.getJSON();
    expect(() =>
      editTable(editor, "t", {
        type: "mergeCells",
        from: { row: 2.5, column: 0 },
        to: { row: 3, column: 1 },
      }),
    ).toThrow(/out of range/);
    expect(() => editTable(editor, "t", { type: "splitCell", row: 0, column: 1.5 })).toThrow(
      /out of range/,
    );
    expect(() => editTable(editor, "t", { type: "splitCell", row: -1, column: 0 })).toThrow(
      /out of range/,
    );
    expect(editor.getJSON()).toEqual(original);
  });
});

describe("merged cells between replicas", () => {
  it("replicates a merge and a split; two WASM editors converge", async () => {
    const make = async (peer: string) => {
      const editor = await createOn("wasm", {
        extensions: DefaultPreset,
        content: doc(table(FRAME)),
      });
      editor.enableCollaboration(peer);
      editors.push(editor);
      return editor;
    };
    const [alice, bob] = await Promise.all([make("alice"), make("bob")]);
    const sync = () => {
      for (let round = 0; round < 2; round++) {
        bob.receiveCollaborationUpdate(alice.getCollaborationUpdate());
        alice.receiveCollaborationUpdate(bob.getCollaborationUpdate());
      }
    };
    editTable(alice, "t", {
      type: "mergeCells",
      from: { row: 4, column: 1 },
      to: { row: 4, column: 2 },
    });
    editTable(bob, "t", { type: "splitCell", row: 0, column: 1 });
    sync();
    expect(alice.getJSON().blocks).toEqual(bob.getJSON().blocks);
    expect(shape(alice)[4]).toEqual(["i", "ik", "ik", "is"]);
    expect(shape(alice)[0]![2]).toBe("new");
    expect(cellText(alice, "ik")).toBe("drafts.ios\n0");
    // undo on one replica reaches the other
    expect(alice.undo()).toBe(true);
    sync();
    expect(alice.getJSON().blocks).toEqual(bob.getJSON().blocks);
    expect(shape(bob)[4]).toEqual(["i", "ik", "iq", "is"]);
  });
});
