import { describe, expect, it } from "vitest";
import { type SearchEntry, fold, search } from "./search-rank";

const page = (s: string, t: string, d: string, x: string[] = []): SearchEntry => ({
  k: "page",
  s,
  p: t,
  t,
  d,
  x,
  u: `/docs/${t.toLowerCase().replace(/\s/g, "-")}/`,
});
const heading = (s: string, p: string, t: string, x: string[] = []): SearchEntry => ({
  k: "heading",
  s,
  p,
  t,
  d: "",
  x,
  u: `/docs/${p.toLowerCase().replace(/\s/g, "-")}/#${t.toLowerCase().replace(/\s/g, "-")}`,
});

const INDEX: SearchEntry[] = [
  page("Extensions", "Tables", "Header rows, column widths, alignment.", ["A table is a block."]),
  heading("Extensions", "Tables", "Nodes", ["table, tableRow and cells"]),
  heading("Extensions", "Tables", "Repair"),
  heading("Extensions", "Tables", "Related"),
  heading("Extensions", "Tables", "Keyboard", ["Tab moves to the next cell"]),
  heading("Editor UI", "Menus", "Tables", ["The table bars and menus."]),
  heading("Core concepts", "Commands", "editTable", ["Insert and delete rows."]),
  page("Core concepts", "Транзакции", "Шаги и история."),
];

const titles = (query: string) =>
  search(INDEX, query).flatMap((group) => group.hits.map((hit) => `${hit.entry.p}›${hit.entry.t}`));

describe("search ranking", () => {
  it("ranks a heading by its own title, not by its page's", () => {
    const found = titles("tables");
    expect(found.slice(0, 2)).toEqual(["Tables›Tables", "Menus›Tables"]);
    expect(found).not.toContain("Tables›Repair");
    expect(found).not.toContain("Tables›Related");
  });

  it("uses the page title to match a word and to order equal scores", () => {
    expect(titles("tables keyboard")[0]).toBe("Tables›Keyboard");
  });

  it("prefers whole words, then prefixes, then word starts in camelCase", () => {
    expect(titles("table")[0]).toBe("Tables›Tables");
    expect(titles("table")).toContain("Commands›editTable");
  });

  it("takes at most three hits from one page", () => {
    const many = [...INDEX, ...["A", "B", "C", "D"].map((t) => heading("X", "Long", `cell ${t}`))];
    const hits = search(many, "cell").flatMap((group) => group.hits);
    expect(hits.filter((hit) => hit.entry.p === "Long")).toHaveLength(3);
  });

  it("groups by section, marks the query and keeps a snippet inside one segment", () => {
    const [group] = search(INDEX, "next cell");
    const hit = group!.hits[0]!;
    expect(hit.entry.t).toBe("Keyboard");
    expect(hit.detail).toBe("Tables · Tab moves to the next cell");
    expect(hit.detailRanges.length).toBe(2);
  });

  it("folds Cyrillic case and ё without a locale", () => {
    expect(fold("ЁЛКА")).toBe("елка");
    expect(titles("транзакции")).toEqual(["Транзакции›Транзакции"]);
  });

  it("finds nothing for an empty query", () => {
    expect(search(INDEX, "  ")).toEqual([]);
  });
});
