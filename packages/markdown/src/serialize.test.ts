import { describe, expect, it } from "vitest";
import { plain } from "./__fixtures__/helpers";
import { blockToMarkdown, fingerprint, markdownRawNodeSpec, parseMarkdown } from "./index";
import type { Block, Span } from "./types";

const b = (
  type: string,
  attrs: Record<string, unknown>,
  content: Block["content"],
  children: Block[] = [],
): Block => ({ id: "", type, attrs, content, children });

const para = (content: Span[]) => b("paragraph", {}, content);

/** Serialize a block and check that parsing gives it back. */
function md(block: Block): string {
  const out = blockToMarkdown(block);
  const back = parseMarkdown(out).doc.blocks;
  expect(back.map(fingerprint)).toEqual([fingerprint(block)]);
  return out;
}

describe("blockToMarkdown", () => {
  it("preserves safe foreground and highlight colors without HTML attribute injection", () => {
    const colored = para([
      {
        text: "Цвет 😀",
        marks: [
          { type: "textColor", attrs: { color: "#123abc" } },
          { type: "highlight", attrs: { color: "rgb(12, 34, 56)" } },
        ],
      },
    ]);
    expect(md(colored)).toContain('<span style="color:#123abc">');
    expect(md(colored)).toContain('<mark style="background:rgb(12, 34, 56)">');
    const hostile = para([
      {
        text: "text",
        marks: [{ type: "textColor", attrs: { color: "red; background:url(https://invalid)" } }],
      },
    ]);
    expect(blockToMarkdown(hostile)).toBe("text");
  });
  it("retains children of authored quotes, callouts and task items", () => {
    const child = para(plain("child body"));
    expect(blockToMarkdown(b("blockquote", {}, plain("quote"), [child]))).toBe(
      "> quote\n>\n> child body",
    );
    expect(blockToMarkdown(b("callout", { type: "note" }, plain("notice"), [child]))).toContain(
      "> child body",
    );
    const list = b("todoList", {}, null, [
      b("todoItem", { checked: false }, plain("task"), [
        b("bulletList", {}, null, [b("listItem", {}, plain("nested"))]),
      ]),
    ]);
    expect(blockToMarkdown(list)).toBe("- [ ] task\n  - nested");
    const custom = b("custom", {}, plain("own body"), [child]);
    expect(blockToMarkdown(custom)).toBe("own body\n\nchild body");
  });
  it("escapes only what is needed", () => {
    expect(md(para(plain("2 * 3 = 6, snake_case, a < b, AT&T")))).toBe(
      "2 * 3 = 6, snake_case, a < b, AT&T",
    );
    expect(md(para(plain("*not* [a](b) `c` <div> &amp; \\* #tag")))).toBe(
      "\\*not\\* \\[a\\](b) \\`c\\` \\<div> \\&amp; \\\\\\* #tag",
    );
    expect(md(para(plain("# not a heading")))).toBe("\\# not a heading");
    // "\n" is a line break of the document: `\` + line ending (a bare one reads as a space)
    expect(md(para(plain("- not a list\n1. nor this\n> nor a quote")))).toBe(
      "\\- not a list\\\n1\\. nor this\\\n\\> nor a quote",
    );
    expect(md(para(plain("line\n===")))).toBe("line\\\n\\===");
    expect(md(para(plain("a | b")))).toBe("a | b");
    expect(md(para(plain("a | b\n-|-")))).toBe("a \\| b\\\n\\-\\|-");
  });

  it("encodes whitespace that Markdown would strip", () => {
    expect(md(para(plain("  indented ")))).toBe("&#32; indented&#32;");
    expect(md(para(plain("\ttab")))).toBe("&#9;tab");
    expect(md(para(plain("a\n\nb")))).toBe("a\\\n&#10;b");
    expect(md(para(plain("\nlead")))).toBe("&#10;lead");
  });

  it("falls back to HTML tags when emphasis delimiters cannot flank", () => {
    expect(
      md(
        para([
          { text: "a", marks: [] },
          { text: " b ", marks: [{ type: "bold" }] },
          { text: "c", marks: [] },
        ]),
      ),
    ).toBe("a<strong> b </strong>c");
    expect(
      md(
        para([
          { text: "x", marks: [] },
          { text: "(y)", marks: [{ type: "italic" }] },
        ]),
      ),
    ).toBe("x<em>(y)</em>");
    expect(
      md(
        para([
          { text: "bold", marks: [{ type: "bold" }] },
          { text: " and ", marks: [] },
          { text: "both", marks: [{ type: "bold" }, { type: "italic" }] },
          { text: " ", marks: [] },
          { text: "gone", marks: [{ type: "strikethrough" }] },
        ]),
      ),
    ).toBe("**bold** and ***both*** ~~gone~~");
  });

  it("serializes inline HTML marks, code and links", () => {
    expect(
      md(
        para([
          { text: "u", marks: [{ type: "underline" }] },
          { text: "m", marks: [{ type: "highlight" }] },
          { text: "2", marks: [{ type: "superscript" }] },
          { text: "x", marks: [{ type: "subscript" }] },
          { text: " ", marks: [] },
          { text: "a`b", marks: [{ type: "code" }] },
          { text: " ", marks: [] },
          {
            text: "site",
            marks: [{ type: "link", attrs: { href: "https://e.x/(a)", title: 'say "hi"' } }],
          },
          { text: " ", marks: [] },
          { text: "https://e.x", marks: [{ type: "link", attrs: { href: "https://e.x" } }] },
          { text: " ", marks: [] },
          { text: "path", marks: [{ type: "link", attrs: { href: "a b/c.md" } }] },
        ]),
      ),
    ).toBe(
      '<u>u</u><mark>m</mark><sup>2</sup><sub>x</sub> ``a`b`` [site](https://e.x/(a) "say \\"hi\\"") https://e.x [path](<a b/c.md>)',
    );
  });

  it("serializes headings, quotes and callouts", () => {
    expect(md(b("heading", { level: 3 }, plain("Заголовок #")))).toBe("### Заголовок \\#");
    expect(md(b("heading", { level: 2 }, plain("a\nb")))).toBe("## a<br>b");
    expect(md(b("blockquote", {}, plain("цитата\nв две строки")))).toBe(
      "> цитата\\\n> в две строки",
    );
    expect(md(b("callout", { type: "warning", alert: "WARNING" }, plain("Осторожно")))).toBe(
      "> [!WARNING]\n> Осторожно",
    );
    // `agent` is a deprecated type without an alert of its own.
    expect(md(b("callout", { type: "agent" }, plain("не трогай таблицу")))).toBe(
      "> [!NOTE]\n> не трогай таблицу",
    );
    // A type that names an Object.prototype member is no alert either.
    expect(md(b("callout", { type: "constructor" }, plain("x")))).toBe("> [!NOTE]\n> x");
    // A bold label at the start of a quote is plain text: the quote reads back as a quote.
    const label: Span[] = [
      { text: "Инструкции для агента:", marks: [{ type: "bold" }] },
      { text: " не трогай таблицу", marks: [] },
    ];
    expect(md(b("blockquote", {}, label))).toBe("> **Инструкции для агента:** не трогай таблицу");
    expect(md(b("blockquote", {}, plain("[!NOTE] not an alert")))).toBe(
      "> \\[!NOTE\\] not an alert",
    );
  });

  it("serializes lists, keeping marker, delimiter, start and spread", () => {
    const item = (t: string, children: Block[] = []) => b("listItem", {}, plain(t), children);
    expect(
      md(
        b("orderedList", { start: 3, delimiter: ")" }, null, [
          item("три"),
          item("четыре", [b("bulletList", { marker: "*" }, null, [item("вложенный")])]),
        ]),
      ),
    ).toBe("3) три\n4) четыре\n   * вложенный");
    expect(md(b("bulletList", { marker: "+", spread: true }, null, [item("a"), item("b")]))).toBe(
      "+ a\n\n+ b",
    );
    expect(
      md(
        b("todoList", {}, null, [
          b("todoItem", { checked: true }, plain("готово"), []),
          b("todoItem", { checked: false }, [], []),
        ]),
      ),
    ).toBe("- [x] готово\n- [ ]");
    expect(
      md(
        b("bulletList", {}, null, [
          item("a", [b("orderedList", { start: 5 }, null, [item("five")])]),
        ]),
      ),
    ).toBe("- a\n\n  5. five");
  });

  it("serializes tables with alignment, pipes and line breaks", () => {
    const cell = (type: string, content: Span[]) => b(type, {}, content);
    const table = b("table", { align: ["left", null, "center"] }, null, [
      b("tableRow", {}, null, [
        cell("tableHeader", plain("Имя")),
        cell("tableHeader", plain("a|b")),
        cell("tableHeader", plain(" ")),
      ]),
      b("tableRow", {}, null, [
        cell("tableCell", [{ text: "x|y", marks: [{ type: "code" }] }]),
        cell("tableCell", plain("1\n2")),
        cell("tableCell", []),
      ]),
    ]);
    expect(md(table)).toBe(
      "| Имя | a\\|b | &#32; |\n| :--- | --- | :---: |\n| `x\\|y` | 1<br>2 |  |",
    );
  });

  it("serializes code blocks, dividers, images and files", () => {
    expect(md(b("codeBlock", { language: "md", meta: "title=x" }, "```js\nx\n```"))).toBe(
      "````md title=x\n```js\nx\n```\n````",
    );
    expect(md(b("codeBlock", { language: "" }, ""))).toBe("```\n```");
    expect(md(b("divider", {}, null))).toBe("---");
    expect(
      md(b("image", { src: "assets/x y.png", alt: "Схема [1]", caption: "Подпись" }, null)),
    ).toBe('![Схема \\[1\\]](<assets/x y.png> "Подпись")');
    expect(md(b("file", { url: "assets/отчёт.pdf", name: "отчёт.pdf" }, null))).toBe(
      "[отчёт.pdf](assets/отчёт.pdf)",
    );
    expect(blockToMarkdown(b("markdownRaw", { kind: "html" }, "<div>\n  x\n</div>"))).toBe(
      "<div>\n  x\n</div>",
    );
  });

  it("serializes nested blocks on their own", () => {
    expect(blockToMarkdown(b("listItem", {}, plain("пункт")))).toBe("- пункт");
    expect(blockToMarkdown(b("todoItem", { checked: true }, plain("x")))).toBe("- [x] x");
    expect(blockToMarkdown(b("tableCell", {}, plain("a|b")))).toBe("a\\|b");
    expect(blockToMarkdown(b("paragraph", {}, plain("a\nb")), "\r\n")).toBe("a\\\r\nb");
  });
});

describe("markdownRawNodeSpec", () => {
  it("is a plain GoTipe node spec", () => {
    expect(markdownRawNodeSpec).toEqual({
      name: "markdownRaw",
      group: ["block"],
      content: "rawText",
      attrs: { kind: { type: "string", default: "" } },
      topLevel: true,
      marksAllowed: "none",
      leaf: true,
      allowsChildren: false,
    });
  });
});
