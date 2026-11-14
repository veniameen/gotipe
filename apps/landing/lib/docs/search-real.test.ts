import { describe, expect, it } from "vitest";
import { buildSearchIndex } from "./search-index";
import { search } from "./search-rank";
import { loadDocs } from "./source";

const index = buildSearchIndex(loadDocs());
const ranked = (query: string) =>
  search(index, query).flatMap((group) =>
    group.hits.map((hit) => `${group.section} › ${hit.entry.p} › ${hit.entry.t}`),
  );

describe("search over the real documentation", () => {
  it("puts both pages and headings named Tables first", () => {
    const hits = ranked("tables");
    expect(hits[0]).toBe("Extensions › Tables › Tables");
    expect(hits.slice(0, 2)).toContain("Editor UI › Menus and controls › Tables");
  });

  it("finds the AI provider page and the REST API's AI section near the top", () => {
    const hits = ranked("ai provider");
    expect(hits[0]).toBe("AI › AI provider › AI provider");
    expect(hits.slice(0, 3)).toContain("Cloud › REST API › AI");
  });
});
