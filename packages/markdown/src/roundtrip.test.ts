import { describe, expect, it } from "vitest";
import { WIKI_PAGE } from "./__fixtures__/wiki-page";
import { parseMarkdown, serializeMarkdown } from "./index";

const roundTrip = (t: string): string => {
  const { doc, snapshot } = parseMarkdown(t);
  return serializeMarkdown(doc, snapshot).text;
};

describe("byte-for-byte round trip", () => {
  it("keeps the wiki page fixture unchanged", () => {
    expect(roundTrip(WIKI_PAGE)).toBe(WIKI_PAGE);
  });

  it("keeps the CRLF variant unchanged", () => {
    const crlf = WIKI_PAGE.replace(/\n/g, "\r\n");
    expect(roundTrip(crlf)).toBe(crlf);
    expect(parseMarkdown(crlf).snapshot.eol).toBe("\r\n");
  });

  it("keeps the variant without trailing newline unchanged", () => {
    const noEol = WIKI_PAGE.replace(/\n+$/, "");
    expect(roundTrip(noEol)).toBe(noEol);
  });

  it("keeps BOM and front matter out of the document", () => {
    const t = `﻿${WIKI_PAGE}`;
    const { doc, snapshot } = parseMarkdown(t);
    expect(snapshot.bom).toBe("﻿");
    expect(snapshot.frontMatter).toBe("---\ntitle: Регламент релиза\ntags: [release, wiki]\n---\n");
    expect(doc.blocks[0]!.type).toBe("heading");
    expect(serializeMarkdown(doc, snapshot).text).toBe(t);
  });

  it.each([
    "",
    " ",
    "\n",
    "  \n\n\t\n",
    "\r\n\r\n",
    "﻿",
    "---\na: 1\n---\n",
    "---\na: 1\n---",
    "﻿---\r\na: 1\r\n...\r\n\r\n",
    "x",
    "x\n\n\n",
    "\n\n# a\n\n\n\nb  ",
    "- a\n* b\n+ c",
    "a\n===\n\nb\n---",
    "    indented\n    code\n",
    "> quote\nlazy",
    "> a\n>\n> b",
    "<!-- comment -->\n\npara",
    "1. a\n\n   para in item\n2. b",
    "- [ ] task\n- not a task",
    "***\n___\n- - -",
    "[link]: </a b> 'title'\n[link]",
    "| a |\n| - |\n| b | extra |\n| c |",
    "x \n y",
  ])("round-trips %j", (t) => {
    expect(roundTrip(t)).toBe(t);
  });
});

describe("document model of the fixture", () => {
  const { doc } = parseMarkdown(WIKI_PAGE);
  const types = doc.blocks.map((b) => b.type);

  it("produces the expected block sequence", () => {
    expect(types).toEqual([
      "heading",
      "blockquote",
      "callout",
      "paragraph",
      "heading",
      "todoList",
      "heading",
      "orderedList",
      "heading",
      "table",
      "codeBlock",
      "codeBlock",
      "image",
      "file",
      "markdownRaw",
      "paragraph",
      "markdownRaw",
      "paragraph",
      "markdownRaw",
      "markdownRaw",
    ]);
  });

  it("parses quotes and callouts", () => {
    // A bold label at the start of a quote has no meaning of its own: it stays text.
    const quote = doc.blocks[1]!;
    expect(quote.attrs).toEqual({});
    expect(quote.content).toEqual([
      { text: "Инструкции для агента:", marks: [{ type: "bold" }] },
      { text: " перед изменением страницы сверяйся с ", marks: [] },
      { text: "чек-листом", marks: [{ type: "link", attrs: { href: "checklist.md" } }] },
      { text: " и не трогай таблицу совместимости.", marks: [] },
    ]);
    const note = doc.blocks[2]!;
    expect(note.attrs).toEqual({ type: "note", alert: "NOTE" });
    expect(note.content).toEqual([
      { text: "Страница обновляется после каждого релиза.", marks: [] },
    ]);
  });

  it("parses marks, soft breaks and links with titles", () => {
    expect(doc.blocks[3]!.content).toEqual([
      { text: "Релиз выпускается ", marks: [] },
      { text: "по вторникам", marks: [{ type: "bold" }] },
      { text: ", если нет ", marks: [] },
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
  });

  it("parses task lists", () => {
    const todo = doc.blocks[5]!;
    expect(todo.attrs).toEqual({ marker: "-", spread: false });
    expect(todo.children.map((c) => [c.type, c.attrs.checked])).toEqual([
      ["todoItem", true],
      ["todoItem", false],
      ["todoItem", false],
    ]);
    expect(todo.children[2]!.content).toEqual([
      { text: "Обновить ", marks: [] },
      { text: "CHANGELOG.md", marks: [{ type: "code" }] },
    ]);
  });

  it("parses ordered lists with `)` and nested bullets", () => {
    const ol = doc.blocks[7]!;
    expect(ol.attrs).toEqual({ start: 1, delimiter: ")", spread: false });
    const second = ol.children[1]!;
    expect(second.content).toEqual([{ text: "Запустить пайплайн", marks: [] }]);
    expect(second.children).toHaveLength(1);
    expect(second.children[0]!.type).toBe("bulletList");
    expect(second.children[0]!.children.map((c) => c.content)).toEqual([
      [{ text: "проверить логи", marks: [] }],
      [{ text: "сверить версии", marks: [] }],
    ]);
  });

  it("parses tables with alignment and escaped pipes", () => {
    const table = doc.blocks[9]!;
    expect(table.attrs).toEqual({ align: ["left", "right", "center"] });
    expect(table.children.map((r) => r.children.map((c) => c.type))).toEqual([
      ["tableHeader", "tableHeader", "tableHeader"],
      ["tableCell", "tableCell", "tableCell"],
      ["tableCell", "tableCell", "tableCell"],
    ]);
    const row = table.children[1]!;
    expect(row.children[0]!.content).toEqual([{ text: "Ядро | core", marks: [] }]);
    expect(row.children[1]!.content).toEqual([{ text: "1.2|3", marks: [{ type: "code" }] }]);
    expect(table.children[2]!.children[2]!.content).toEqual([
      { text: "снят", marks: [{ type: "strikethrough" }] },
    ]);
  });

  it("parses code blocks, images and file links", () => {
    expect(doc.blocks[10]!.attrs).toEqual({ language: "ts" });
    expect(doc.blocks[10]!.content).toBe('const version = "1.2.3";');
    expect(doc.blocks[11]!.content).toBe("```js\nconsole.log(1)\n```");
    expect(doc.blocks[12]!.attrs).toEqual({
      src: "assets/x.png",
      alt: "Схема",
      caption: "Подпись",
    });
    expect(doc.blocks[13]!.attrs).toEqual({ url: "assets/отчёт.pdf", name: "отчёт.pdf" });
  });

  it("keeps HTML, definitions and footnotes verbatim", () => {
    expect(doc.blocks[14]!.content).toBe("<details>\n<summary>История изменений</summary>");
    expect(doc.blocks[16]!.content).toBe("</details>");
    expect(doc.blocks[18]!.attrs).toEqual({ kind: "definition" });
    expect(doc.blocks[19]!.attrs).toEqual({ kind: "footnoteDefinition" });
    const p = doc.blocks[17]!;
    expect(p.content).toEqual([
      { text: "Сноска к правилу", marks: [] },
      { text: "[^1]", marks: [{ type: "mdRaw" }] },
      { text: " и ссылка на ", marks: [] },
      { text: "[регламент][reg]", marks: [{ type: "mdRaw" }] },
      { text: ".\nПервая строка с жёстким переносом\nвторая строка.", marks: [] },
    ]);
    // Mixed soft and hard breaks: soft serialization.
    expect(p.attrs).toEqual({});
  });

  it("parses inline HTML marks and hard-break paragraphs", () => {
    const { doc: d } = parseMarkdown(
      "a <u>u</u> <mark>m</mark> x<sup>2</sup> H<sub>2</sub>O <b>b</b> <span>s</span>\\\nnext",
    );
    expect(d.blocks[0]!.attrs).toEqual({ breaks: "hard" });
    expect(d.blocks[0]!.content).toEqual([
      { text: "a ", marks: [] },
      { text: "u", marks: [{ type: "underline" }] },
      { text: " ", marks: [] },
      { text: "m", marks: [{ type: "highlight" }] },
      { text: " x", marks: [] },
      { text: "2", marks: [{ type: "superscript" }] },
      { text: " H", marks: [] },
      { text: "2", marks: [{ type: "subscript" }] },
      { text: "O ", marks: [] },
      { text: "b", marks: [{ type: "bold" }] },
      { text: " ", marks: [] },
      { text: "<span>", marks: [{ type: "mdRaw" }] },
      { text: "s", marks: [] },
      { text: "</span>", marks: [{ type: "mdRaw" }] },
      { text: "\nnext", marks: [] },
    ]);
  });

  it("turns mixed task lists and complex quotes into raw blocks", () => {
    const { doc: d } = parseMarkdown("- [ ] a\n- b\n\n> a\n>\n> b\n\n- a\n\n  para\n");
    expect(d.blocks.map((b) => [b.type, b.attrs.kind])).toEqual([
      ["markdownRaw", "list"],
      ["markdownRaw", "blockquote"],
      ["markdownRaw", "list"],
    ]);
    expect(d.blocks[0]!.content).toBe("- [ ] a\n- b");
  });

  it("converts <br> in table cells and headings to newlines", () => {
    const { doc: d } = parseMarkdown("# a<br>b\n\n| x<br/>y |\n| --- |\n");
    expect(d.blocks[0]!.content).toEqual([{ text: "a\nb", marks: [] }]);
    expect(d.blocks[1]!.children[0]!.children[0]!.content).toEqual([{ text: "x\ny", marks: [] }]);
  });
});

describe("nested task lists", () => {
  const TASKS = "- [ ] Журнал\n  - [x] Схема\n  - [ ] Миграция\n- [x] Шифрование\n";
  const MIXED = "- Выкат\n  - [ ] Включить для 5 %\n  - [ ] Сравнить потери\n";

  it("reads sub-tasks under a task and writes them back byte for byte", () => {
    const { doc } = parseMarkdown(TASKS);
    const list = doc.blocks[0]!;
    expect(list.type).toBe("todoList");
    const nested = list.children[0]!.children[0]!;
    expect(nested.type).toBe("todoList");
    expect(nested.children.map((c) => [c.type, c.attrs.checked])).toEqual([
      ["todoItem", true],
      ["todoItem", false],
    ]);
    expect(roundTrip(TASKS)).toBe(TASKS);
  });

  it("reads tasks nested under a plain list item", () => {
    const { doc } = parseMarkdown(MIXED);
    const item = doc.blocks[0]!.children[0]!;
    expect(item.type).toBe("listItem");
    expect(item.children[0]!.type).toBe("todoList");
    expect(roundTrip(MIXED)).toBe(MIXED);
  });

  it("writes a new sub-task as an indented task", () => {
    const { doc, snapshot } = parseMarkdown("- [ ] Журнал\n- [ ] Миграция\n");
    const [first, second] = doc.blocks[0]!.children;
    first!.children = [
      { id: "sub", type: "todoList", attrs: { marker: "-" }, content: null, children: [second!] },
    ];
    doc.blocks[0]!.children = [first!];
    expect(serializeMarkdown(doc, snapshot).text).toBe("- [ ] Журнал\n  - [ ] Миграция\n");
  });
});
