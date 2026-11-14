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

  it("writes an inline atom as one element and keeps its fallback text when attributes fail", () => {
    const atom = (
      text: string,
      type: string,
      attrs: Record<string, unknown>,
      ...more: string[]
    ) => ({
      text,
      marks: [...more.map((name) => ({ type: name })), { type, attrs }],
    });
    // The atom decides the element wherever its mark sits; the other marks wrap it.
    expect(
      spansToHtml([atom("@Анна", "mention", { id: "42", label: "Анна", kind: "user" }, "bold")]),
    ).toBe(
      '<strong><span data-type="mention" data-kind="user" data-id="42" data-label="Анна">@Анна</span></strong>',
    );
    expect(spansToHtml([atom('x < "y"', "inlineMath", {})])).toBe(
      '<span data-type="math">x &lt; &quot;y&quot;</span>',
    );
    expect(
      spansToHtml([
        atom(":party:", "customEmoji", { name: "party", src: "https://cdn.test/p.png" }),
      ]),
    ).toBe('<img data-type="emoji" alt=":party:" src="https://cdn.test/p.png">');
    expect(
      spansToHtml([
        atom("Схема 😀", "inlineImage", { src: "a.png", alt: "Схема 😀", width: 40, height: 20 }),
      ]),
    ).toBe('<img src="a.png" alt="Схема 😀" width="40" height="20">');
    // Unsafe addresses, a missing id and sizes that are not small positive integers.
    for (const [span, html] of [
      [atom("@x", "mention", { id: "", label: "x" }), "@x"],
      [atom("@x", "mention", { id: 7, label: "x" }), "@x"],
      [atom(":e:", "customEmoji", { name: "e", src: "javascript:alert(1)" }), ":e:"],
      [atom("alt", "inlineImage", { src: "data:text/html;base64,PHNjcmlwdD4=" }), "alt"],
      [
        atom("alt", "inlineImage", { src: 'a.png" onerror="x', width: -1, height: "9" }),
        '<img src="a.png&quot; onerror=&quot;x" alt="alt">',
      ],
      [
        atom("@x", "mention", { id: '"><script>', label: "<b>", kind: "admin" }),
        '<span data-type="mention" data-kind="user" data-id="&quot;&gt;&lt;script&gt;" data-label="&lt;b&gt;">@x</span>',
      ],
    ] as const)
      expect(spansToHtml([span])).toBe(html);
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
