// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToHtml, renderToMarkdown, renderToText } from "../src/ssr";

const doc = {
  version: 1,
  blocks: [
    {
      id: "title",
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Title", marks: [] }],
      children: [],
    },
    {
      id: "list",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [
        {
          id: "item",
          type: "listItem",
          attrs: {},
          content: [{ text: "Nested", marks: [{ type: "bold", attrs: {} }] }],
          children: [],
        },
      ],
    },
  ],
};

describe("server rendering", () => {
  it("renders public editor JSON as HTML without DOM or WASM", async () => {
    expect(typeof DOMParser).toBe("undefined");
    expect(await renderToHtml(doc)).toBe(
      "<h2>Title</h2>\n<ul>\n<li><strong>Nested</strong></li>\n</ul>",
    );
  });

  it("renders Markdown and recursive plain text", async () => {
    expect(await renderToMarkdown(doc)).toContain("**Nested**");
    expect(await renderToText(doc)).toBe("Title\nNested");
  });

  it("honours custom renderers for nested blocks", async () => {
    expect(
      await renderToHtml(doc, {
        blockRenderers: {
          listItem: (block) => `<li class="custom" data-id="${block.id}">Custom</li>`,
        },
      }),
    ).toBe('<h2>Title</h2>\n<ul>\n<li class="custom" data-id="item">Custom</li>\n</ul>');
  });
});

describe("HTML presentation options", () => {
  it("applies classes and structural styles recursively without changing default HTML", async () => {
    const html = await renderToHtml(doc, { classPrefix: "article-", inlineStyles: true });
    expect(html).toContain('class="article-heading"');
    expect(html).toContain('class="article-bulletList"');
    expect(html).toContain('class="article-listItem"');
    expect(html).toContain('style="line-height:1.5"');
    expect(await renderToHtml(doc)).not.toContain('class="article-');
  });

  it("keeps trusted custom renderers working alongside presentation options", async () => {
    const html = await renderToHtml(doc, {
      classPrefix: "article-",
      inlineStyles: true,
      blockRenderers: { listItem: () => '<li class="custom">Own renderer</li>' },
    });
    expect(html).toContain('<li class="custom">Own renderer</li>');
    expect(html).not.toContain("gotipe-ssr-");
  });

  it("rejects an attribute-injecting class prefix", async () => {
    await expect(renderToHtml(doc, { classPrefix: 'x" onclick="alert(1)' })).rejects.toThrow(
      "classPrefix",
    );
  });
});
