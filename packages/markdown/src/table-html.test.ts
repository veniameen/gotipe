import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./index";
import type { Block, Doc } from "./types";

const cell = (id: string, text: string, attrs: Record<string, unknown> = {}, type = "tableCell") =>
  ({ id, type, attrs, content: [{ text, marks: [] }], children: [] }) as Block;
const row = (id: string, cells: Block[]) =>
  ({ id, type: "tableRow", attrs: {}, content: null, children: cells }) as Block;
const spans = (
  id: string,
  runs: [string, { type: string; attrs?: Record<string, unknown> }[]][],
  attrs: Record<string, unknown> = {},
) =>
  ({
    id,
    type: "tableCell",
    attrs,
    content: runs.map(([text, marks]) => ({ text, marks })),
    children: [],
  }) as Block;
/** Blocks without ids: what a parse means. */
function strip(block: Block): unknown {
  return {
    type: block.type,
    attrs: block.attrs,
    content: block.content,
    children: (block.children ?? []).map(strip),
  };
}
const table = (rows: Block[]): Block => ({
  id: "t",
  type: "table",
  attrs: { align: [null, "right"] },
  content: null,
  children: rows,
});

describe("a table with merged cells in Markdown", () => {
  const merged = table([
    row("r0", [cell("a", "Журнал", { colspan: 2 }, "tableHeader")]),
    row("r1", [cell("b", "x <y> & z", { rowspan: 2 }), cell("c", "1 284")]),
    row("r2", [cell("d", "😀\nдва")]),
  ]);

  it("is an HTML table block that keeps every span, cell and character", () => {
    const { text, map } = serializeMarkdown({ version: 1, blocks: [merged] });
    expect(text).toBe(
      [
        "<table>",
        "<tr>",
        '<th colspan="2">Журнал</th>',
        "</tr>",
        "<tr>",
        '<td rowspan="2">x &lt;y&gt; &amp; z</td>',
        '<td style="text-align:right">1 284</td>',
        "</tr>",
        "<tr>",
        '<td style="text-align:right">😀<br>два</td>',
        "</tr>",
        "</table>",
        "",
      ].join("\n"),
    );
    // the source map still finds each cell and its text
    for (const id of ["a", "b", "c", "d"])
      expect(map.blocks.some((entry) => entry.blockId === id)).toBe(true);
    const plain = map.segments.find((segment) => segment.blockId === "c")!;
    expect(text.slice(plain.mdFrom, plain.mdTo)).toBe("1 284");
    expect(plain.exact).toBe(true);
    expect(map.segments.find((segment) => segment.blockId === "b")!.exact).toBe(false);
  });

  it("is read back as the same table and written again byte for byte", () => {
    const first = serializeMarkdown({ version: 1, blocks: [merged] }).text;
    const { doc, snapshot } = parseMarkdown(first);
    expect(doc.blocks.map(strip)).toEqual([strip(merged)]);
    expect(serializeMarkdown(doc, snapshot).text).toBe(first);
    expect(serializeMarkdown(doc).text).toBe(first);
  });

  it("brings back marks, links, colours, header spans, row spans, breaks and escapes", () => {
    const rich = {
      ...table([
        row("r0", [
          cell("a", "Журнал", { colspan: 2 }, "tableHeader"),
          cell("h", "Шифрование", { rowspan: 2 }, "tableHeader"),
        ]),
        row("r1", [
          cell("k", "Ключ", {}, "tableHeader"),
          cell("q", "В очереди", {}, "tableHeader"),
        ]),
        row("r2", [
          spans(
            "b",
            [
              ['x <y> & "z"', []],
              ["жирный", [{ type: "bold" }]],
              [
                "ссылка",
                [
                  { type: "link", attrs: { href: "https://example.com/?a=1&b=2" } },
                  { type: "italic" },
                ],
              ],
            ],
            { rowspan: 2 },
          ),
          spans("c", [
            ["red", [{ type: "textColor", attrs: { color: "#c4382f" } }]],
            [" ", []],
            ["mark", [{ type: "highlight", attrs: { color: "rgb(255 240 0)" } }, { type: "code" }]],
          ]),
          spans("s", [["😀\nдва", [{ type: "strikethrough" }, { type: "superscript" }]]], {
            rowspan: 2,
          }),
        ]),
        row("r3", [
          spans(
            "d",
            [
              ["H", []],
              ["2", [{ type: "subscript" }]],
              ["O", [{ type: "underline" }]],
            ],
            { align: "center" },
          ),
        ]),
      ]),
      attrs: { align: [null, "right", null] },
    };
    const first = serializeMarkdown({ version: 1, blocks: [rich] }).text;
    expect(first).toContain('<a href="https://example.com/?a=1&amp;b=2"><em>ссылка</em></a>');
    expect(first).toContain('<td style="text-align:center">');
    const { doc, snapshot } = parseMarkdown(first);
    expect(doc.blocks.map(strip)).toEqual([strip(rich)]);
    expect(serializeMarkdown(doc).text).toBe(first);
    expect(serializeMarkdown(doc, snapshot).text).toBe(first);
    // the source map of the kept bytes points into the cells' text
    const { map } = serializeMarkdown(doc, snapshot);
    const id = doc.blocks[0]!.children[1]!.children[1]!.id;
    const segment = map.segments.find((entry) => entry.blockId === id)!;
    expect(first.slice(segment.mdFrom, segment.mdTo)).toBe("В очереди");
    expect(segment.exact).toBe(true);
    // an edit in a cell rewrites the table, the other bytes are kept
    const edited = structuredClone(doc);
    (edited.blocks[0]!.children[1]!.children[1]!.content as { text: string }[])[0]!.text =
      "Очередь";
    expect(serializeMarkdown(edited, snapshot).text).toBe(first.replace("В очереди", "Очередь"));
  });

  it("keeps text kept verbatim in its cells as it is (D-103)", () => {
    const raw = (text: string, ...marks: { type: string }[]) => ({
      text,
      marks: [...marks, { type: "mdRaw" }],
    });
    const verbatim = table([
      row("r0", [cell("a", "h", { colspan: 2 }, "tableHeader")]),
      row("r1", [
        // neighbouring verbatim runs of one mark share a `<span>`, as they read back as one
        {
          ...cell("b", ""),
          content: [raw("![i](u.png)"), raw("<br>"), raw("x", { type: "bold" })],
        },
        { ...cell("c", ""), content: [{ text: "<kbd> ", marks: [] }, raw("<kbd>")] },
      ]),
    ]);
    const { text, map } = serializeMarkdown({ version: 1, blocks: [verbatim] });
    expect(text).toContain(
      "<td><span>![i](u.png)&lt;br&gt;</span><strong><span>x</span></strong></td>",
    );
    expect(text).toContain(
      '<td style="text-align:right">&lt;kbd&gt; <span>&lt;kbd&gt;</span></td>',
    );
    const segment = map.segments.find((entry) => entry.blockId === "b")!;
    expect(text.slice(segment.mdFrom, segment.mdTo)).toBe("![i](u.png)");
    expect(segment.exact).toBe(true);
    const { doc, snapshot } = parseMarkdown(text);
    expect(doc.blocks[0]!.children[1]!.children.map((c) => c.content)).toEqual([
      [raw("![i](u.png)<br>"), raw("x", { type: "bold" })],
      [{ text: "<kbd> ", marks: [] }, raw("<kbd>")],
    ]);
    expect(serializeMarkdown(doc, snapshot).text).toBe(text);
    expect(serializeMarkdown(doc).text).toBe(text);
  });

  it("keeps HTML that is not the writer's table raw, byte for byte", () => {
    for (const source of [
      "<table>\n<tr>\n<td>a</td>\n</tr>\n</table>\n",
      '<table>\n<tr>\n<td colspan="2"><b>a</b></td>\n</tr>\n</table>\n',
      '<table>\n<tr>\n<td colspan="2">a &nbsp; b</td>\n</tr>\n</table>\n',
      '<table class="x">\n<tr>\n<td colspan="2">a</td>\n</tr>\n</table>\n',
      // a `<span>` holds text kept verbatim: text and line breaks, which the writer escapes
      '<table>\n<tr>\n<td colspan="2"><span><b>a</b></span></td>\n</tr>\n</table>\n',
      '<table>\n<tr>\n<td colspan="2"><span></span>a</td>\n</tr>\n</table>\n',
      '<table>\n<tr>\n<td colspan="2"><span>a</td>\n</tr>\n</table>\n',
      '<table>\n<tr>\n<td colspan="2"><span>a</span><span>b</span></td>\n</tr>\n</table>\n',
    ]) {
      const { doc, snapshot } = parseMarkdown(source);
      expect(doc.blocks[0]).toMatchObject({ type: "markdownRaw", content: source.trimEnd() });
      expect(serializeMarkdown(doc, snapshot).text).toBe(source);
    }
  });

  it("indents the HTML with its list item", () => {
    const item: Block = {
      id: "li",
      type: "listItem",
      attrs: {},
      content: [{ text: "item", marks: [] }],
      children: [merged],
    };
    const list: Doc = {
      version: 1,
      blocks: [{ id: "l", type: "bulletList", attrs: {}, content: null, children: [item] }],
    };
    const lines = serializeMarkdown(list).text.split("\n");
    expect(lines.slice(lines.indexOf("  <table>"), lines.indexOf("  </table>") + 1)).toHaveLength(
      12,
    );
    expect(lines.filter((line) => line.startsWith("  <"))).toHaveLength(12);
  });

  it("leaves a table without merged cells a pipe table", () => {
    const plain = table([
      row("r0", [cell("a", "A", {}, "tableHeader"), cell("b", "B", { colspan: 1 }, "tableHeader")]),
      row("r1", [cell("c", "1"), cell("d", "2", { rowspan: "1" })]),
    ]);
    expect(serializeMarkdown({ version: 1, blocks: [plain] }).text).toBe(
      "| A | B |\n| --- | ---: |\n| 1 | 2 |\n",
    );
  });

  it("keeps a table whose first row has no cells, as the Rust writer does", () => {
    const sparse = table([
      row("r0", []),
      row("r1", [cell("c", "1"), cell("d", "2")]),
      row("r2", []),
    ]);
    expect(serializeMarkdown({ version: 1, blocks: [sparse] }).text).toBe(
      "|  |  |\n| --- | ---: |\n| 1 | 2 |\n|  |  |\n",
    );
    // a table without a single cell has nothing to write
    expect(serializeMarkdown({ version: 1, blocks: [table([row("r0", [])])] }).text).toBe("");
  });

  it("keeps the bytes of an untouched pipe table", () => {
    const source = "|A|  B |\n|-|-:|\n|1|2|\n";
    const { doc, snapshot } = parseMarkdown(source);
    expect(serializeMarkdown(doc, snapshot).text).toBe(source);
  });
});
