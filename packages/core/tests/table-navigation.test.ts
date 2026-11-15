import { describe, expect, it } from "vitest";
import { adjacentCell } from "../src/table/navigation";

interface Node {
  id: string;
  type: string;
  children: Node[];
}
const node = (id: string, type: string, children: Node[] = []): Node => ({ id, type, children });
const table = (id: string, rows: Node[][]): Node =>
  node(
    id,
    "table",
    rows.map((cells, index) => node(`${id}-row-${index}`, "tableRow", cells)),
  );
const cell = (id: string, type = "tableCell", children: Node[] = []) => node(id, type, children);
const next = (blocks: Node[], id: string) => adjacentCell(blocks, id, "next")?.id ?? null;
const prev = (blocks: Node[], id: string) => adjacentCell(blocks, id, "prev")?.id ?? null;

describe("adjacentCell (D-10)", () => {
  const first = table("first", [
    [cell("h1", "tableHeader"), cell("h2", "tableHeader")],
    [cell("a1"), cell("a2")],
  ]);
  const second = table("second", [[cell("b1"), cell("b2")]]);
  const blocks = [node("p", "paragraph"), first, node("q", "paragraph"), second];

  it("walks the cells of one table row by row, header cells included", () => {
    expect(next(blocks, "h1")).toBe("h2");
    expect(next(blocks, "h2")).toBe("a1");
    expect(prev(blocks, "a1")).toBe("h2");
  });

  it("stops at the edges of the table instead of entering its neighbours", () => {
    expect(next(blocks, "a2")).toBeNull();
    expect(prev(blocks, "b1")).toBeNull();
    expect(prev(blocks, "h1")).toBeNull();
    expect(next(blocks, "b2")).toBeNull();
  });

  it("follows a row with a merged cell, which has fewer cells than the grid", () => {
    const merged = table("merged", [[cell("wide")], [cell("c1"), cell("c2")]]);
    expect(next([merged], "wide")).toBe("c1");
    expect(prev([merged], "c1")).toBe("wide");
  });

  it("keeps the cells of a table inside a cell to that inner table", () => {
    const inner = table("inner", [[cell("i1"), cell("i2")]]);
    const outer = table("outer", [[cell("o1", "tableCell", [inner]), cell("o2")]]);
    expect(next([outer], "o1")).toBe("o2");
    expect(prev([outer], "o2")).toBe("o1");
    expect(next([outer], "i1")).toBe("i2");
    expect(next([outer], "i2")).toBeNull();
    expect(prev([outer], "i1")).toBeNull();
  });

  it("finds nothing outside a table or for an unknown block", () => {
    expect(next(blocks, "p")).toBeNull();
    expect(next(blocks, "first-row-0")).toBeNull();
    expect(next(blocks, "missing")).toBeNull();
  });
});
