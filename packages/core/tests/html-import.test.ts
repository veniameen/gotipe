import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHtmlDocument } from "../src/html";
import { createEditor } from "../src/js";
import { blocksToText } from "../src/text";

afterEach(() => vi.unstubAllGlobals());

describe("HTML document input", () => {
  it("imports the documented content string without discarding text or formatting", async () => {
    const editor = await createEditor({
      extensions: [],
      content: "<p>Hello <strong>World</strong></p>",
    });
    expect(editor.getText()).toBe("Hello World");
    expect(editor.getViewState().blocks[0]!.content).toEqual([
      { text: "Hello ", marks: [] },
      { text: "World", marks: [{ type: "bold", attrs: {} }] },
    ]);
    editor.setContent("<h2>Заголовок</h2><p><em>Текст</em><br>Новая строка</p>");
    expect(editor.getText()).toBe("Заголовок\nТекст\nНовая строка");
    expect(editor.getViewState().blocks[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    editor.destroy();
  });

  it("reads text-align of paragraphs and headings and writes it back the same", async () => {
    const html =
      '<h2 style="text-align:center">Заголовок</h2>\n<p style="text-align:justify">Текст 😀</p>\n<p style="text-align:right">r</p>\n<p>plain</p>';
    const doc = parseHtmlDocument(
      `${html}<p align="LEFT">l</p><p style="text-align:start">s</p><h1 style="text-align:middle">m</h1>`,
    );
    expect(doc.blocks.map((block) => [block.type, block.attrs.align ?? null])).toEqual([
      ["heading", "center"],
      ["paragraph", "justify"],
      ["paragraph", "right"],
      ["paragraph", null],
      ["paragraph", "left"],
      ["paragraph", null],
      ["heading", null],
    ]);
    const { DefaultPreset } = await import("../src/presets");
    const editor = await createEditor({ extensions: [DefaultPreset], content: html });
    expect(editor.getHTML()).toBe(html);
    editor.destroy();
  });

  it("keeps nested lists, ordered starts, task states and rich text", () => {
    const doc = parseHtmlDocument(
      '<ol start="3"><li><p>A <b>bold</b></p><ul><li>Nested</li></ul></li><li>B</li></ol>' +
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><input type="checkbox" checked>Done</li></ul>',
    );
    expect(doc.blocks[0]).toMatchObject({ type: "orderedList", attrs: { start: 3 } });
    expect(doc.blocks[0]!.children[0]!.children[0]).toMatchObject({ type: "bulletList" });
    expect(doc.blocks[1]!.children[0]).toMatchObject({
      type: "todoItem",
      attrs: { checked: true },
    });
    expect(blocksToText(doc.blocks)).toBe("A bold\nNested\nB\nDone");
  });

  it("preserves code whitespace and table structure", () => {
    const doc = parseHtmlDocument(
      '<pre><code class="language-typescript">  const x = 1;\n\n  x++;</code></pre>' +
        '<table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td rowspan="2"><i>A</i></td><td style="text-align:right">42</td></tr></tbody></table>',
    );
    expect(doc.blocks[0]).toMatchObject({
      type: "codeBlock",
      attrs: { language: "typescript" },
      content: "  const x = 1;\n\n  x++;",
    });
    expect(doc.blocks[1]!.children[0]!.children[0]!.type).toBe("tableHeader");
    // a cell over rows past the last row is cut there, as browsers draw it
    expect(doc.blocks[1]!.children[1]!.children[0]!.attrs.rowspan).toBe(1);
    expect(doc.blocks[1]!.children[1]!.children[1]!.attrs.align).toBe("right");
    expect(blocksToText(doc.blocks)).toContain("Name\tValue\nA\t42");
  });

  it("keeps images, captions and toggle children", () => {
    const doc = parseHtmlDocument(
      '<figure><img src="assets/a.png" alt="Picture" width="320"><figcaption>Caption</figcaption></figure>' +
        "<details open><summary>Summary</summary><p>Hidden text</p></details>",
    );
    expect(doc.blocks[0]).toMatchObject({
      type: "image",
      attrs: { src: "assets/a.png", alt: "Picture", width: 320, caption: "Caption" },
    });
    expect(doc.blocks[1]).toMatchObject({ type: "toggle", attrs: { open: true } });
    expect(blocksToText(doc.blocks)).toContain("Summary\nHidden text");
  });

  it("drops executable content and unsafe links while keeping the readable text", () => {
    const doc = parseHtmlDocument(
      '<script>alert(1)</script><p onclick="bad()"><a href="java&#9;script:alert(1)">Unsafe</a> <a href="docs/a.md">Safe</a></p>',
    );
    expect(blocksToText(doc.blocks)).toBe("Unsafe Safe");
    const content = doc.blocks[0]!.content;
    expect(content).toEqual([
      { text: "Unsafe ", marks: [] },
      {
        text: "Safe",
        marks: [
          {
            type: "link",
            attrs: { href: "docs/a.md", target: "_blank", rel: "noopener noreferrer" },
          },
        ],
      },
    ]);
  });

  it("fails before replacing existing content when headless HTML cannot be parsed", async () => {
    const editor = await createEditor({ extensions: [], content: "<p>Keep me</p>" });
    vi.stubGlobal("DOMParser", undefined);
    expect(() => editor.setContent("<p>New</p>")).toThrow(/DOMParser/);
    expect(editor.getText()).toBe("Keep me");
    editor.destroy();
  });
});
