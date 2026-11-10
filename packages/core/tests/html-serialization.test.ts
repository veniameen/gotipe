import { describe, expect, it } from "vitest";
import { parseHtmlDocument } from "../src/html";
import { type HtmlBlock, blocksToHtml, spansToHtml } from "../src/serialization/html";

describe("canonical HTML serialization", () => {
  it("preserves marks and line breaks while removing unsafe links and style declarations", () => {
    const html = spansToHtml([
      {
        text: 'a\nb<"',
        marks: [
          { type: "bold" },
          { type: "link", attrs: { href: "java\nscript:alert(1)" } },
          { type: "highlight", attrs: { color: "red;position:fixed" } },
        ],
      },
    ]);
    expect(html).toBe("<mark><strong>a<br>b&lt;&quot;</strong></mark>");
    expect(parseHtmlDocument(html).blocks[0]!.content).toEqual([
      {
        text: 'a\nb<"',
        marks: [
          { type: "highlight", attrs: {} },
          { type: "bold", attrs: {} },
        ],
      },
    ]);
  });

  it("preserves nested list children, start numbers and table spans", () => {
    const block = (type: string, text = "", attrs = {}, children: HtmlBlock[] = []): HtmlBlock => ({
      type,
      attrs,
      content: text ? [{ text, marks: [] }] : null,
      children,
    });
    const html = blocksToHtml([
      block("orderedList", "", { start: 5 }, [
        block("listItem", "row", {}, [block("bulletList", "", {}, [block("listItem", "nested")])]),
      ]),
      block("table", "", {}, [
        block("tableRow", "", {}, [block("tableCell", "wide", { colspan: 2, align: "right" })]),
      ]),
      block("image", "", { src: "javascript:alert(1)", alt: "<broken>" }),
    ]);
    expect(html).toContain('<ol start="5">');
    expect(html).toContain("<li>nested</li>");
    expect(html).toContain('<td colspan="2" style="text-align:right">wide</td>');
    expect(html).toContain('<img src="" alt="&lt;broken&gt;">');
  });
});

describe("HTML export presentation", () => {
  it("retains explicit table alignment when neutral styles are requested", () => {
    const html = blocksToHtml(
      [
        {
          type: "tableCell",
          attrs: { align: "right" },
          content: [{ text: "Привет 😀", marks: [] }],
          children: [],
        },
      ],
      { inlineStyles: true, classPrefix: "doc-" },
    );
    expect(html).toContain('class="doc-tableCell"');
    expect(html).toContain("vertical-align:top;text-align:right");
    expect(html).toContain("Привет 😀");
  });
});
