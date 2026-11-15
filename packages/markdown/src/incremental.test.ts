import { describe, expect, it } from "vitest";
import { clone, counterIds, plain, replacedSlice } from "./__fixtures__/helpers";
import { WIKI_PAGE } from "./__fixtures__/wiki-page";
import { fingerprint, isBlockEmpty, parseMarkdown, serializeMarkdown } from "./index";
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

  // D-99: the `>` line that ended the quote's paragraph kept the next block out of the quote
  it.each([
    ["a quote", "> a\n>\nb\n", "> a!\n\nb\n"],
    ["a quote with CRLF", "> a\r\n>\r\n>\r\nb\r\n", "> a!\r\n\r\nb\r\n"],
    ["a callout", "> [!NOTE]\n> a\n>\nb\n", "> [!NOTE]\n> a!\n\nb\n"],
    ["a quote before indented code", "> a\n>\n    code\n", "> a!\n\n    code\n"],
  ])("an edited %s that loses its closing `>` line is followed by a blank line", (_, text, out) => {
    const { doc, snapshot } = setup(text);
    expect(doc.blocks).toHaveLength(2);
    doc.blocks[0]!.content = plain("a!");
    expect(serializeMarkdown(doc, snapshot).text).toBe(out);
    expect(parseMarkdown(out).doc.blocks.map((b) => [b.type, b.content])).toEqual(
      doc.blocks.map((b) => [b.type, b.content]),
    );
  });

  // the blanks before the next line belong to the block that starts there: a rewritten block or
  // one that does not need them is written without them, a preserved one that does keeps them
  it.each<[string, string, (blocks: Block[]) => void, string]>([
    [
      "a heading turned into a list",
      "# h\n  text\n",
      (blocks) => {
        blocks[0] = {
          ...blocks[0]!,
          type: "bulletList",
          attrs: {},
          content: null,
          children: [{ id: "i", type: "listItem", attrs: {}, content: plain("h"), children: [] }],
        };
      },
      "- h\n\ntext\n",
    ],
    [
      "an indented list that cannot interrupt",
      "# h\n 2. o\n    - n\n",
      (blocks) => {
        blocks[1]!.children[0]!.content = plain("o!");
      },
      "# h\n\n2. o!\n   - n\n",
    ],
    [
      "indented code turned into a paragraph",
      "# h\n    code\n",
      (blocks) => {
        blocks[1] = { ...blocks[1]!, type: "paragraph", attrs: {}, content: plain("code") };
      },
      "# h\n\ncode\n",
    ],
    [
      "an indented paragraph turned into code",
      "# h\n   a\n",
      (blocks) => {
        blocks[1] = { ...blocks[1]!, type: "codeBlock", attrs: {}, content: "x\ny" };
      },
      "# h\n\n```\nx\ny\n```\n",
    ],
    [
      "a heading turned into a paragraph before an indented fence",
      "# h\n   ```\n   x\n   ```\n",
      (blocks) => {
        blocks[0] = { ...blocks[0]!, type: "paragraph", attrs: {} };
      },
      "h\n\n   ```\n   x\n   ```\n",
    ],
    [
      "a paragraph after indented code",
      "    code\na\n",
      (blocks) => {
        blocks[1]!.content = plain("a!");
      },
      "    code\na!\n",
    ],
  ])("%s keeps only the blanks a block needs", (_, text, edit, out) => {
    const { doc, snapshot } = setup(text);
    edit(doc.blocks);
    expect(serializeMarkdown(doc, snapshot).text).toBe(out);
    expect(parseMarkdown(out).doc.blocks.map((b) => fingerprint(b))).toEqual(
      doc.blocks.map((b) => fingerprint(b)),
    );
  });

  // D-102: the snapshot keeps the blanks before the first line of a block at the end of the gap
  // before it (of `leading` before the first block); they go with the block, where it needs them
  const para = (text: string): Block => ({
    id: `new-${text}`,
    type: "paragraph",
    attrs: {},
    content: plain(text),
    children: [],
  });
  const list = (text: string): Block => ({
    id: `new-${text}`,
    type: "bulletList",
    attrs: {},
    content: null,
    children: [
      { id: `new-${text}-i`, type: "listItem", attrs: {}, content: plain(text), children: [] },
    ],
  });
  const editItem = (blocks: Block[]): void => {
    blocks[0]!.children[0]!.content = plain("a!");
  };
  it.each<[string, string, (blocks: Block[]) => void, string]>([
    [
      "deleting the block before indented code",
      "p\n\nq\n\n    code\n",
      (b) => b.splice(1, 1),
      "p\n\n    code\n",
    ],
    [
      "deleting the first block before indented code",
      "p\n\n    code\n",
      (b) => b.splice(0, 1),
      "    code\n",
    ],
    [
      "a paragraph before indented code that starts the file",
      "    code\n\np\n",
      (b) => b.unshift(para("new")),
      "new\n\n    code\n\np\n",
    ],
    [
      "editing indented code after a blank line",
      "p\n\n    code\n",
      (b) => {
        b[1]!.content = "code!";
      },
      "p\n\n```\ncode!\n```\n",
    ],
    [
      "editing indented code that starts the file",
      "    code\n",
      (b) => {
        b[0]!.content = "code!";
      },
      "```\ncode!\n```\n",
    ],
    [
      "deleting before indented code with CRLF",
      "p\r\n\r\nq\r\n\r\n    code\r\n",
      (b) => b.splice(1, 1),
      "p\r\n\r\n    code\r\n",
    ],
    [
      "editing indented code with CRLF",
      "p\r\n\r\n    code\r\n",
      (b) => {
        b[1]!.content = "code!";
      },
      "p\r\n\r\n```\r\ncode!\r\n```\r\n",
    ],
    ["a paragraph after an edited list", "-   a\n\n  p\n", editItem, "- a!\n\np\n"],
    [
      "a paragraph after an edited list with CRLF",
      "-   a\r\n\r\n  p\r\n",
      editItem,
      "- a!\r\n\r\np\r\n",
    ],
    [
      "indented code after an edited list",
      "-    a\n\n    code\n",
      editItem,
      "- a!\n\n```\ncode\n```\n",
    ],
    [
      "indented code after a list once the block between them is deleted",
      "- a\n\nq\n\n    code\n",
      (b) => b.splice(1, 1),
      "- a\n\n```\ncode\n```\n",
    ],
    [
      "code indented with a tab after a new list",
      "a\n\n\tcode\n",
      (b) => b.splice(1, 0, list("n")),
      "a\n\n- n\n\n```\ncode\n```\n",
    ],
    [
      "indented code after indented code once the block between them is deleted",
      "    a\n\nq\n\n    b\n",
      (b) => b.splice(1, 1),
      "    a\n\n```\nb\n```\n",
    ],
    [
      "a fence indented by one before a new first paragraph",
      " ```\n x\n ```\n",
      (b) => b.unshift(para("new")),
      "new\n\n ```\n x\n ```\n",
    ],
    [
      "a fence indented by two after an edited paragraph",
      "p\n\n  ```\n  x\n  ```\n",
      (b) => {
        b[0]!.content = plain("p!");
      },
      "p!\n\n  ```\n  x\n  ```\n",
    ],
    [
      "a fence indented by three once the block before it is deleted",
      "p\n\nq\n\n   ```\n   x\n   ```\n",
      (b) => b.splice(1, 1),
      "p\n\n   ```\n   x\n   ```\n",
    ],
    [
      "an edited fence indented by three",
      "p\r\n\r\n   ```\r\n   x\r\n   ```\r\n",
      (b) => {
        b[1]!.content = "x!";
      },
      "p\r\n\r\n```\r\nx!\r\n```\r\n",
    ],
    [
      "a list once the block before it is deleted",
      "q\n\n  - x\n\n   p\n",
      (b) => b.splice(0, 1),
      "  - x\n\n   p\n",
    ],
    [
      "a heading turned into a list before indented code",
      "# h\n    code\n",
      (b) => {
        b[0] = list("h");
      },
      "- h\n\n```\ncode\n```\n",
    ],
  ])("D-102: %s keeps the blanks with the block", (_, text, edit, out) => {
    const { doc, snapshot } = setup(text);
    edit(doc.blocks);
    expect(serializeMarkdown(doc, snapshot).text).toBe(out);
    expect(parseMarkdown(out).doc.blocks.map((b) => fingerprint(b))).toEqual(
      doc.blocks.map((b) => fingerprint(b)),
    );
  });

  // the text of the last span gets a "!": links and other marks stay
  const bang = (block: Block): void => {
    const spans = Array.isArray(block.content) ? block.content : [];
    const last = spans.at(-1)!;
    block.content = [...spans.slice(0, -1), { ...last, text: `${last.text}!` }];
  };
  const lines = (prefix: string, n: number): string =>
    Array.from({ length: n }, (_, i) => `${prefix}l${i}`).join("\n");
  it.each<[string, string, (blocks: Block[]) => void, string]>([
    [
      "an edited fence after a list: the gap of the source does not indent it",
      `  * s\n  \`\`\`\n${lines("  ", 8)}\n      deep\n  \`\`\`\n`,
      (b) => {
        b[1]!.content = `${b[1]!.content}!`;
      },
      `  * s\n\`\`\`\n${lines("", 8)}\n    deep!\n\`\`\`\n`,
    ],
    [
      "an edited list with a long first item after a list",
      `  - a\n   1. ${lines("      ", 9).trimStart()}\n      - n\n`,
      (b) => bang(b[1]!.children[0]!),
      `  - a\n1. ${lines("      ", 9).trimStart()}!\n   - n\n`,
    ],
    [
      "a raw list after an edited list that gives back its blanks",
      "  * s\n\n  - [x] t\n   - a\n",
      (b) => bang(b[0]!.children[0]!),
      "  * s!\n\n  - [x] t\n   - a\n",
    ],
    [
      "a raw list whose blanks hold its code",
      "  * s\n\n  - a\n\n      para\n",
      (b) => bang(b[0]!.children[0]!),
      "  * s!\n\n  - a\n\n      para\n",
    ],
    [
      "definitions after an edited paragraph with references",
      "See [the docs][docs] and [site] now.\n\n  [docs]: http://d\n  [site]: http://s\n",
      (b) => bang(b[0]!),
      "See [the docs][docs] and [site] now.!\n\n  [docs]: http://d\n  [site]: http://s\n",
    ],
    [
      "a divider moved behind another: the first opens no front matter",
      "  ---\n\n  ---\n\np\n",
      (b) => b.splice(1, 0, ...b.splice(0, 1)),
      "  ---\n\n  ---\n\np\n",
    ],
    [
      "a list rewritten after a list takes another marker",
      "- x\n\nq\n\n  * a\n      * n\n",
      (b) => {
        b.splice(1, 1);
        b[1]!.attrs = { ...b[1]!.attrs, marker: "-" };
      },
      "- x\n\n* a\n  * n\n",
    ],
    [
      "a fence after a list rewritten for its marker: both lists take back their blanks",
      "  a\n\n   - l\n\n   ```\n   x\n   ```\n",
      (b) => {
        b[0] = { ...list("a"), id: b[0]!.id };
      },
      "  - a\n\n   * l\n\n   ```\n   x\n   ```\n",
    ],
    [
      "a formula after an edited task list",
      "  - [x] t\n\n  $$\n  x\n  $$\n",
      (b) => bang(b[0]!.children[0]!),
      "  - [x] t!\n\n  $$\n  x\n  $$\n",
    ],
  ])("D-102: %s", (_, text, edit, out) => {
    const { doc, snapshot } = setup(text);
    edit(doc.blocks);
    expect(serializeMarkdown(doc, snapshot).text).toBe(out);
    expect(parseMarkdown(out).doc.blocks.map((b) => fingerprint(b))).toEqual(
      doc.blocks.map((b) => fingerprint(b)),
    );
  });

  it("D-102: untouched blocks keep the blanks they do not need while they stand apart", () => {
    const { doc, snapshot, text } = setup("  a\n\n  b\n\n-    c\n\n    code\n");
    expect(serializeMarkdown(doc, snapshot).text).toBe(text);
    doc.blocks[0]!.content = plain("a!");
    expect(serializeMarkdown(doc, snapshot).text).toBe("a!\n\n  b\n\n-    c\n\n    code\n");
  });

  it("a table rewritten as HTML is followed by a blank line: HTML ends only there", () => {
    const { doc, snapshot } = setup("| h | i |\n| - | - |\n| c | d |\n# x\n");
    const row = doc.blocks[0]!.children[1]!;
    row.children = [{ ...row.children[0]!, attrs: { colspan: 2 } }];
    const out = serializeMarkdown(doc, snapshot).text;
    expect(out).toMatch(/<\/table>\n\n# x\n$/);
    expect(parseMarkdown(out).doc.blocks.map((b) => b.type)).toEqual(["table", "heading"]);
  });
});

// D-106: a fence, or HTML that ends only at its own end, which the end of its file ended takes in
// a block written after it; with another block after it, it gets its end
describe("a block the end of its file ended (D-106)", () => {
  const para = (text: string): Block => ({
    id: `new-${text}`,
    type: "paragraph",
    attrs: {},
    content: plain(text),
    children: [],
  });
  const append = (blocks: Block[]): void => {
    blocks.push(para("new"));
  };
  const lastFirst = (blocks: Block[]): void => {
    blocks.unshift(blocks.pop()!);
  };
  const shape = (blocks: Block[]): unknown[] =>
    blocks.map((b) => [b.type, typeof b.content === "string" ? b.content : fingerprint(b)]);

  it.each<[string, string, (blocks: Block[]) => void, string]>([
    ["a fence", "a\n\n```\nx\n", append, "a\n\n```\nx\n```\n\nnew\n"],
    ["a fence without a last line ending", "a\n\n```\nx", append, "a\n\n```\nx\n```\n\nnew\n"],
    [
      "a fence with empty lines at its end",
      "a\n\n```\nx\n\n\n",
      append,
      "a\n\n```\nx\n\n\n```\n\nnew\n",
    ],
    ["a fence of tildes with info", "a\n\n~~~~ js\nx\n", append, "a\n\n~~~~ js\nx\n~~~~\n\nnew\n"],
    ["an indented fence", "a\n\n  ```\n  x\n", append, "a\n\n  ```\n  x\n```\n\nnew\n"],
    ["a formula fence", "a\n\n```math\nx\n", append, "a\n\n```math\nx\n```\n\nnew\n"],
    ["a fence moved before a block", "a\n\n```\nx\n", lastFirst, "```\nx\n```\n\na\n"],
    [
      "a fence with CRLF",
      "a\r\n\r\n```\r\nx\r\n",
      append,
      "a\r\n\r\n```\r\nx\r\n```\r\n\r\nnew\r\n",
    ],
    [
      "a fence that ends with a lone CR in an LF file",
      "a\n\nb\n\n```\rx\r\r",
      append,
      "a\n\nb\n\n```\rx\r\r```\n\nnew\n",
    ],
  ])("D-106: %s gets its closing fence", (_, text, edit, out) => {
    const { doc, snapshot } = setup(text);
    edit(doc.blocks);
    expect(serializeMarkdown(doc, snapshot).text).toBe(out);
    expect(parseMarkdown(out).doc.blocks.map((b) => fingerprint(b))).toEqual(
      doc.blocks.map((b) => fingerprint(b)),
    );
  });

  it.each<[string, string, (blocks: Block[]) => void, string, string]>([
    ["raw <pre>", "a\n\n<pre>\nx\n", append, "a\n\n<pre>\nx\n</pre>\n\nnew\n", "<pre>\nx\n</pre>"],
    [
      "raw <pre> moved before a block",
      "a\n\n<pre>\nx",
      lastFirst,
      "<pre>\nx\n</pre>\n\na\n",
      "<pre>\nx\n</pre>",
    ],
    [
      "a raw comment with CRLF",
      "a\r\n\r\n<!-- x\r\n",
      append,
      "a\r\n\r\n<!-- x\r\n-->\r\n\r\nnew\r\n",
      "<!-- x\r\n-->",
    ],
    [
      "raw <SCRIPT>",
      "a\n\n<SCRIPT>\nx\n",
      append,
      "a\n\n<SCRIPT>\nx\n</script>\n\nnew\n",
      "<SCRIPT>\nx\n</script>",
    ],
    [
      "a raw declaration",
      "a\n\n<!DOCTYPE x\n",
      append,
      "a\n\n<!DOCTYPE x\n>\n\nnew\n",
      "<!DOCTYPE x\n>",
    ],
  ])("D-106: %s gets its end on a line of its own", (_, text, edit, out, raw) => {
    const { doc, snapshot } = setup(text);
    edit(doc.blocks);
    expect(serializeMarkdown(doc, snapshot).text).toBe(out);
    // the raw source gains its end; the blocks stay apart
    const read = parseMarkdown(out).doc.blocks;
    const want = doc.blocks.map((b) => (b.type === "markdownRaw" ? { ...b, content: raw } : b));
    expect(shape(read)).toEqual(shape(want));
  });

  it.each<[string, string, (blocks: Block[]) => void, string]>([
    [
      "an open fence that stays the last block",
      "a\n\n```\nx\n",
      (b) => {
        b[0]!.content = plain("a!");
      },
      "a!\n\n```\nx\n",
    ],
    [
      "indented code that looks like a fence",
      "a\n\n    ```\n    x\n",
      append,
      "a\n\n    ```\n    x\n\nnew\n",
    ],
    ["a closed fence", "a\n\n```\nx\n```\n", append, "a\n\n```\nx\n```\n\nnew\n"],
    ["HTML that ends at a blank line", "a\n\n<div>\nx\n", append, "a\n\n<div>\nx\n\nnew\n"],
    ["a fence inside a list", "- a\n  ```\n  x\n", append, "- a\n  ```\n  x\n\nnew\n"],
  ])("D-106: %s gets nothing", (_, text, edit, out) => {
    const { doc, snapshot } = setup(text);
    edit(doc.blocks);
    expect(serializeMarkdown(doc, snapshot).text).toBe(out);
    expect(shape(parseMarkdown(out).doc.blocks)).toEqual(shape(doc.blocks));
  });

  it("D-106: the returned snapshot and its map hold the end the block got", () => {
    const { doc, snapshot } = setup("a\n\n```\nx\n");
    doc.blocks.push(para("new"));
    const first = serializeMarkdown(doc, snapshot);
    const code = first.snapshot.blocks[1]!;
    expect(first.text.slice(code.start, code.end)).toBe("```\nx\n```");
    expect(first.map.blocks.find((b) => b.blockId === code.id)).toMatchObject({
      start: code.start,
      end: code.end,
    });
    expect(serializeMarkdown(doc, first.snapshot).text).toBe(first.text);
    // the last block again, the fence keeps its end
    doc.blocks.pop();
    expect(serializeMarkdown(doc, first.snapshot).text).toBe("a\n\n```\nx\n```\n");
  });
});

// D-107: raw source is written as it is, so a raw list keeps its marker; next to a raw list of
// the same marker, the items of the later one take another marker
describe("neighbouring raw lists with one marker (D-107)", () => {
  /** The source of a raw list without the markers of its items, which the writer may change. */
  const items = (blocks: Block[]): unknown[] =>
    blocks.map((b) =>
      typeof b.content === "string"
        ? [b.type, b.content.replace(/^([ \t]*\d{0,9})[-*+.)](?=[ \t\r\n]|$)/gm, "$1•")]
        : fingerprint(b),
    );
  const deleteSecond = (blocks: Block[]): void => {
    blocks.splice(1, 1);
  };

  it.each([
    ["raw bullet lists", "- a\n\n  b\n-\n\n   - c\n\n     d\n"],
    ["raw numbered lists", "1. a\n\n   b\n2.\n\n   3. c\n\n      d\n"],
    ["lists", "- a\n-\n\n   - c\n"],
  ])("D-107: neighbouring %s that read apart in the source keep their bytes", (_, text) => {
    const { doc, snapshot } = setup(text);
    expect(doc.blocks).toHaveLength(2);
    expect(serializeMarkdown(doc, snapshot).text).toBe(text);
  });

  it.each<[string, string, (blocks: Block[]) => void, string]>([
    [
      "items of paragraphs",
      "- a\n\n  b\n\nq\n\n- c\n\n  d\n",
      deleteSecond,
      "- a\n\n  b\n\n* c\n\n  d\n",
    ],
    [
      "mixed tasks",
      "- [ ] a\n- b\n\nq\n\n- [x] c\n- d\n",
      deleteSecond,
      "- [ ] a\n- b\n\n* [x] c\n* d\n",
    ],
    [
      "numbered items",
      "1. a\n\n   b\n\nq\n\n1. c\n\n   d\n",
      deleteSecond,
      "1. a\n\n   b\n\n1) c\n\n   d\n",
    ],
    [
      "a list moved away from between them",
      "- a\n\n  b\n\n* x\n\n- c\n\n  d\n",
      (b) => b.push(...b.splice(1, 1)),
      "- a\n\n  b\n\n+ c\n\n  d\n\n* x\n",
    ],
    [
      "three lists",
      "- a\n\n  b\n\nq\n\n- c\n\n  d\n\nr\n\n- e\n\n  f\n",
      (b) => {
        b.splice(3, 1);
        b.splice(1, 1);
      },
      "- a\n\n  b\n\n* c\n\n  d\n\n- e\n\n  f\n",
    ],
    [
      "an item that `*` would make a thematic break",
      "- a\n\n  b\n\nq\n\n- * *\n\n  c\n",
      deleteSecond,
      "- a\n\n  b\n\n+ * *\n\n  c\n",
    ],
    [
      "no marker that keeps the later one list: the earlier takes another",
      "+ a\n\n  b\n\nq\n\n+ - -\n+ * *\n\n  c\n",
      deleteSecond,
      "- a\n\n  b\n\n+ - -\n+ * *\n\n  c\n",
    ],
    [
      "a numbered list between them that cannot take another delimiter",
      "1. o\n1) o\n1. a\n\n   b\n",
      (b) => b.unshift(...b.splice(1, 1)),
      "1) o\n\n1. o\n\n1) a\n\n   b\n",
    ],
    [
      "an indented list",
      "- a\n\n  b\n\nq\n\n - c\n\n   d\n",
      deleteSecond,
      "- a\n\n  b\n\n * c\n\n   d\n",
    ],
    [
      "a CRLF file",
      "- a\r\n\r\n  b\r\n\r\nq\r\n\r\n- c\r\n\r\n  d\r\n",
      deleteSecond,
      "- a\r\n\r\n  b\r\n\r\n* c\r\n\r\n  d\r\n",
    ],
  ])("D-107: raw lists stay apart from their neighbours: %s", (_, text, edit, out) => {
    const { doc, snapshot } = setup(text);
    edit(doc.blocks);
    const written = serializeMarkdown(doc, snapshot);
    expect(written.text).toBe(out);
    expect(items(parseMarkdown(out).doc.blocks)).toEqual(items(doc.blocks));
    // the returned snapshot writes them the same way again
    expect(serializeMarkdown(doc, written.snapshot).text).toBe(out);
  });
});
