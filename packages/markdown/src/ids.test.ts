import { describe, expect, it } from "vitest";
import { counterIds } from "./__fixtures__/helpers";
import { WIKI_PAGE } from "./__fixtures__/wiki-page";
import { lcsPairs } from "./ids";
import { parseMarkdown, serializeMarkdown } from "./index";
import type { Block } from "./types";

const ids = (blocks: Block[]): string[] => blocks.map((b) => b.id);

describe("id reuse after an external change", () => {
  it("rejects an exhausted ID factory rather than returning duplicate document identities", () => {
    expect(() => parseMarkdown("one\n\ntwo", { createId: () => "same" })).toThrow("unique");
    expect(() => parseMarkdown("one", { createId: () => "" })).toThrow("non-empty");
  });
  const first = parseMarkdown(WIKI_PAGE, { createId: counterIds("old") });
  const old = first.doc.blocks;

  it("keeps ids of unchanged blocks, inherits ids of 1:1 replaced blocks, creates new ids", () => {
    const changed = WIKI_PAGE.replace(
      "Релиз выпускается **по вторникам**",
      "Релиз выпускается по пятницам",
    )
      .replace("## Совместимость\n\n", "## Совместимость\n\nВставленный абзац.\n\n")
      .replace('![Схема](assets/x.png "Подпись")\n\n', "");
    const next = parseMarkdown(changed, { previous: first.snapshot, createId: counterIds("new") });
    const nb = next.doc.blocks;
    expect(nb[3]!.id).toBe(old[3]!.id); // edited paragraph: replaced in place
    expect(nb[3]!.content).toEqual([
      { text: "Релиз выпускается по пятницам, если нет ", marks: [] },
      { text: "блокеров", marks: [{ type: "italic" }] },
      { text: ". Ответственный — дежурный инженер.\nПодробнее в ", marks: [] },
      {
        text: "вики",
        marks: [
          { type: "link", attrs: { href: "https://wiki.example.com/release", title: "Вики" } },
        ],
      },
      { text: ".", marks: [] },
    ]);
    expect(nb[9]!.type).toBe("paragraph");
    expect(nb[9]!.id).toMatch(/^new-/); // inserted
    expect(nb[10]!.id).toBe(old[9]!.id); // table
    // Image removed: the file block keeps its id.
    const oldFile = old.find((b) => b.type === "file")!;
    expect(nb.find((b) => b.type === "file")!.id).toBe(oldFile.id);
    expect(nb.some((b) => b.type === "image")).toBe(false);
    // All other blocks keep their ids.
    const kept = nb.filter((b) => !b.id.startsWith("new-"));
    expect(kept.length).toBe(nb.length - 1);
    expect(new Set(ids(nb)).size).toBe(nb.length);
  });

  it("matches nested blocks of a changed container", () => {
    const changed = WIKI_PAGE.replace(
      "- [ ] Прогнать e2e-тесты",
      "- [x] Прогнать e2e-тесты",
    ).replace("   - сверить версии", "   - сверить версии\n   - отметить релиз");
    const next = parseMarkdown(changed, { previous: first.snapshot, createId: counterIds("new") });
    const oldTodo = old[5]!;
    const newTodo = next.doc.blocks[5]!;
    expect(newTodo.id).toBe(oldTodo.id);
    expect(ids(newTodo.children)).toEqual(ids(oldTodo.children));
    expect(newTodo.children[1]!.attrs.checked).toBe(true);

    const oldOl = old[7]!;
    const newOl = next.doc.blocks[7]!;
    expect(newOl.id).toBe(oldOl.id);
    expect(ids(newOl.children)).toEqual(ids(oldOl.children));
    const oldNested = oldOl.children[1]!.children[0]!;
    const newNested = newOl.children[1]!.children[0]!;
    expect(newNested.id).toBe(oldNested.id);
    expect(ids(newNested.children).slice(0, 2)).toEqual(ids(oldNested.children));
    expect(newNested.children[2]!.id).toMatch(/^new-/);
  });

  it("keeps table row and cell ids when one cell changes", () => {
    const changed = WIKI_PAGE.replace("| Редактор | 2.0 |", "| Редактор | 2.1 |");
    const next = parseMarkdown(changed, { previous: first.snapshot });
    const ot = old[9]!;
    const nt = next.doc.blocks[9]!;
    expect(nt.id).toBe(ot.id);
    const cellIds = (t: Block) => t.children.flatMap((r) => [r.id, ...ids(r.children)]);
    expect(cellIds(nt)).toEqual(cellIds(ot));
  });

  it("reuses ids from a previous document when no snapshot is given", () => {
    const changed = WIKI_PAGE.replace("# Регламент релиза", "# Регламент выпуска");
    const next = parseMarkdown(changed, { previousDoc: first.doc, createId: counterIds("new") });
    expect(ids(next.doc.blocks)).toEqual(ids(old));
  });

  it("serializing the re-parsed document with its new snapshot is identity", () => {
    const changed = WIKI_PAGE.replace("Старые записи.", "Совсем старые записи.");
    const next = parseMarkdown(changed, { previous: first.snapshot });
    expect(serializeMarkdown(next.doc, next.snapshot).text).toBe(changed);
  });

  it("generates fresh UUID v7 ids by default", () => {
    const { doc } = parseMarkdown("a\n\nb");
    for (const b of doc.blocks) {
      expect(b.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(doc.blocks[0]!.id).not.toBe(doc.blocks[1]!.id);
  });
});

describe("lcsPairs", () => {
  it("finds the longest common subsequence", () => {
    expect(lcsPairs(["a", "b", "c", "d"], ["a", "c", "x", "d"])).toEqual([
      [0, 0],
      [2, 1],
      [3, 3],
    ]);
    expect(lcsPairs([], ["a"])).toEqual([]);
    expect(lcsPairs(["a", "a"], ["a"])).toEqual([[0, 0]]);
  });
});
