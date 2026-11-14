import { describe, expect, it } from "vitest";
import { clone, counterIds, plain, replacedSlice } from "./__fixtures__/helpers";
import { WIKI_PAGE } from "./__fixtures__/wiki-page";
import { isBlockEmpty, parseMarkdown, serializeMarkdown } from "./index";
import type { Block } from "./types";

const FM = "---\ntitle: Регламент релиза\ntags: [release, wiki]\n---\n";

function setup(text = WIKI_PAGE) {
  const { doc, snapshot } = parseMarkdown(text, { createId: counterIds("b") });
  return { doc: clone(doc), snapshot, text };
}

function sliceOf(snapshot: ReturnType<typeof setup>["snapshot"], id: string) {
  const b = snapshot.blocks.find((x) => x.id === id)!;
  return { start: b.start, end: b.end };
}

describe("incremental serialization", () => {
  it("editing one paragraph changes only that block's slice", () => {
    const { doc, snapshot, text } = setup();
    const p = doc.blocks[3]!;
    p.content = [
      { text: "Релиз выпускается ", marks: [] },
      { text: "по средам", marks: [{ type: "bold" }] },
      { text: ".", marks: [] },
    ];
    const out = serializeMarkdown(doc, snapshot).text;
    const { start, end } = sliceOf(snapshot, p.id);
    expect(replacedSlice(text, out, start, end)).toBe("Релиз выпускается **по средам**.");
  });

  it("an edited quote that starts with a bold label is written as a plain blockquote", () => {
    const { doc, snapshot, text } = setup();
    const quote = doc.blocks[1]!;
    expect(quote.type).toBe("blockquote");
    quote.content = [
      { text: "Инструкции для агента:", marks: [{ type: "bold" }] },
      { text: " сверяйся с ", marks: [] },
      { text: "чек-листом", marks: [{ type: "link", attrs: { href: "checklist.md" } }] },
      { text: ".", marks: [] },
    ];
    const out = serializeMarkdown(doc, snapshot).text;
    const { start, end } = sliceOf(snapshot, quote.id);
    expect(replacedSlice(text, out, start, end)).toBe(
      "> **Инструкции для агента:** сверяйся с [чек-листом](checklist.md).",
    );
    expect(parseMarkdown(out).doc.blocks[1]).toMatchObject({ type: "blockquote", attrs: {} });
  });

  it("editing a table cell re-serializes only the table", () => {
    const { doc, snapshot, text } = setup();
    const table = doc.blocks[9]!;
    table.children[2]!.children[1]!.content = plain("2.1");
    const out = serializeMarkdown(doc, snapshot).text;
    const { start, end } = sliceOf(snapshot, table.id);
    expect(replacedSlice(text, out, start, end)).toBe(
      [
        "| Компонент | Версия | Статус |",
        "| :--- | ---: | :---: |",
        "| Ядро \\| core | `1.2\\|3` | ✅ |",
        "| Редактор | 2.1 | ~~снят~~ |",
      ].join("\n"),
    );
  });

  it("deleting a block removes it together with its gap", () => {
    const { doc, snapshot, text } = setup();
    doc.blocks.splice(12, 1);
    const out = serializeMarkdown(doc, snapshot).text;
    expect(out).toBe(text.replace('![Схема](assets/x.png "Подпись")\n\n', ""));
  });

  it("deleting the last block keeps the trailing text of the new last block", () => {
    const { doc, snapshot } = setup("a\n\nb\n\nc");
    doc.blocks.pop();
    expect(serializeMarkdown(doc, snapshot).text).toBe("a\n\nb\n");
  });

  it("inserting a paragraph between two preserved blocks", () => {
    const { doc, snapshot, text } = setup();
    const fileIdx = doc.blocks.findIndex((b) => b.type === "file");
    doc.blocks.splice(fileIdx + 1, 0, {
      id: "new-1",
      type: "paragraph",
      attrs: {},
      content: [
        { text: "Новый ", marks: [] },
        { text: "абзац", marks: [{ type: "italic" }] },
      ],
      children: [],
    });
    const out = serializeMarkdown(doc, snapshot).text;
    expect(out).toBe(
      text.replace(
        "[отчёт.pdf](assets/отчёт.pdf)\n\n",
        "[отчёт.pdf](assets/отчёт.pdf)\n\nНовый *абзац*\n\n",
      ),
    );
  });

  it("inserting a heading before the first block keeps the front matter byte-for-byte", () => {
    const { doc, snapshot, text } = setup();
    doc.blocks.unshift({
      id: "new-h",
      type: "heading",
      attrs: { level: 2 },
      content: plain("Новый раздел"),
      children: [],
    });
    const out = serializeMarkdown(doc, snapshot).text;
    expect(out.startsWith(FM)).toBe(true);
    expect(out).toBe(`${FM}\n## Новый раздел\n\n${text.slice(FM.length + 1)}`);
  });

  it("keeps BOM and front matter when every block is deleted", () => {
    const { doc, snapshot } = setup(`﻿${WIKI_PAGE}`);
    doc.blocks = [];
    expect(serializeMarkdown(doc, snapshot).text).toBe(`﻿${FM}`);
  });

  it("adds a line break after a front matter that ends the file", () => {
    const { doc, snapshot } = setup("---\na: 1\n---");
    doc.blocks.push({ id: "n", type: "paragraph", attrs: {}, content: plain("x"), children: [] });
    expect(serializeMarkdown(doc, snapshot).text).toBe("---\na: 1\n---\nx\n");
  });

  it("re-serialized blocks use the file's CRLF line breaks", () => {
    const crlf = WIKI_PAGE.replace(/\n/g, "\r\n");
    const { doc, snapshot, text } = setup(crlf);
    const p = doc.blocks[3]!;
    p.content = plain("строка 1\nстрока 2");
    const out = serializeMarkdown(doc, snapshot).text;
    const { start, end } = sliceOf(snapshot, p.id);
    expect(replacedSlice(text, out, start, end)).toBe("строка 1\\\r\nстрока 2");
  });

  it("editing the last block of a file without trailing newline keeps it that way", () => {
    const { doc, snapshot } = setup("# T\n\nlast");
    doc.blocks[1]!.content = plain("changed");
    expect(serializeMarkdown(doc, snapshot).text).toBe("# T\n\nchanged");
  });

  it("hard-break paragraphs are re-serialized with backslash breaks", () => {
    const { doc, snapshot } = setup("a\\\nb\n");
    expect(doc.blocks[0]!.content).toEqual(plain("a\nb"));
    doc.blocks[0]!.content = plain("a\nb\nc");
    expect(serializeMarkdown(doc, snapshot).text).toBe("a\\\nb\\\nc\n");
  });

  it("the returned snapshot makes the next serialization incremental again", () => {
    const { doc, snapshot } = setup();
    doc.blocks[3]!.content = plain("Первая правка.");
    const first = serializeMarkdown(doc, snapshot);
    const json = JSON.parse(JSON.stringify(first.snapshot));
    expect(serializeMarkdown(doc, json).text).toBe(first.text);
    const table = doc.blocks[9]!;
    table.children[1]!.children[2]!.content = plain("❌");
    const second = serializeMarkdown(doc, json);
    const t = first.snapshot.blocks.find((b) => b.id === table.id)!;
    const replaced = replacedSlice(first.text, second.text, t.start, t.end);
    expect(replaced).toContain("| Ядро \\| core | `1.2\\|3` | ❌ |");
    // The re-serialized paragraph is now preserved verbatim too.
    expect(second.text).toContain("\n\nПервая правка.\n\n");
  });

  it("an unchanged parse result serializes identically even after JSON cloning", () => {
    const { doc, snapshot, text } = setup();
    expect(serializeMarkdown(clone(doc), clone(snapshot)).text).toBe(text);
  });

  it("serializes without a snapshot", () => {
    const { doc } = setup();
    const out = serializeMarkdown(doc).text;
    expect(out.startsWith("# Регламент релиза\n\n> **Инструкции для агента:** перед")).toBe(true);
    expect(out).toContain("> [!NOTE]\n> Страница обновляется после каждого релиза.");
    expect(out).toContain("- [x] Собрать сборку\n- [ ] Прогнать e2e-тесты");
    expect(out).toContain(
      "1) Создать ветку `release/x.y`\n2) Запустить пайплайн\n   - проверить логи",
    );
    expect(out).toContain("````md\n```js\nconsole.log(1)\n```\n````");
    expect(out).toContain('![Схема](assets/x.png "Подпись")');
    expect(out).toContain("[отчёт.pdf](assets/отчёт.pdf)");
    expect(out.endsWith("[^1]: Правило действует с 2024 года.\n")).toBe(true);
    // Re-parsing gives the same document (ignoring ids).
    const again = parseMarkdown(out).doc;
    const strip = (b: Block): unknown => ({
      t: b.type,
      c: b.content,
      ch: b.children.map(strip),
    });
    expect(again.blocks.map(strip)).toEqual(doc.blocks.map(strip));
  });
});

describe("empty blocks", () => {
  it("isBlockEmpty detects empty paragraphs and headings", () => {
    const mk = (type: string, content: Block["content"]): Block => ({
      id: "x",
      type,
      attrs: {},
      content,
      children: [],
    });
    expect(isBlockEmpty(mk("paragraph", []))).toBe(true);
    expect(isBlockEmpty(mk("paragraph", [{ text: "", marks: [] }]))).toBe(true);
    expect(isBlockEmpty(mk("heading", []))).toBe(true);
    expect(isBlockEmpty(mk("paragraph", plain(" ")))).toBe(false);
    expect(isBlockEmpty(mk("todoList", null))).toBe(false);
    expect(isBlockEmpty(mk("markdownRaw", ""))).toBe(true);
  });

  it("skips new empty paragraphs and headings but keeps preserved ones", () => {
    const { doc, snapshot } = setup("#\n\ntext\n");
    expect(doc.blocks[0]!.type).toBe("heading");
    doc.blocks.splice(1, 0, {
      id: "e1",
      type: "paragraph",
      attrs: {},
      content: [],
      children: [],
    });
    doc.blocks.push({ id: "e2", type: "heading", attrs: { level: 2 }, content: [], children: [] });
    expect(serializeMarkdown(doc, snapshot).text).toBe("#\n\ntext\n");
  });
});

describe("structural hazards", () => {
  it("adjacent lists with the same marker get a different marker", () => {
    const { doc, snapshot } = setup("- a\n\n<!-- x -->\n\n- b\n");
    doc.blocks.splice(1, 1);
    const out = serializeMarkdown(doc, snapshot).text;
    expect(out).toBe("- a\n\n* b\n");
    expect(parseMarkdown(out).doc.blocks.map((b) => b.type)).toEqual(["bulletList", "bulletList"]);
  });

  it("a divider as first block of a file without front matter is not read as front matter", () => {
    const doc = {
      version: 1,
      blocks: [
        { id: "1", type: "divider", attrs: {}, content: null, children: [] },
        { id: "2", type: "paragraph", attrs: {}, content: plain("x"), children: [] },
        { id: "3", type: "divider", attrs: {}, content: null, children: [] },
      ],
    };
    const out = serializeMarkdown(doc).text;
    expect(out).toBe("***\n\nx\n\n---\n");
    expect(parseMarkdown(out).doc.blocks.map((b) => b.type)).toEqual([
      "divider",
      "paragraph",
      "divider",
    ]);
  });

  it("an edited block next to a block it was not separated from by a blank line", () => {
    const { doc, snapshot } = setup("text\n# heading\n");
    doc.blocks[0]!.content = plain("new text");
    expect(serializeMarkdown(doc, snapshot).text).toBe("new text\n# heading\n");
    // A type change cannot keep a single line break.
    doc.blocks[1] = { ...doc.blocks[1]!, type: "paragraph", attrs: {} };
    expect(serializeMarkdown(doc, snapshot).text).toBe("new text\n\nheading\n");
  });
});
