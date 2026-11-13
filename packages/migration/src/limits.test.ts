import { describe, expect, it } from "vitest";
import { convertLexicalToGoTipe, convertProseMirrorToGoTipe, convertSlateToGoTipe } from "./index";

const size = 50_000;
function ids(): () => string {
  let next = 0;
  return () => `b${++next}`;
}
/** A ProseMirror document of `levels` bullet lists, each inside the item of the one above. */
function nestedLists(levels: number): object {
  let node: object = { type: "paragraph", content: [{ type: "text", text: "deep" }] };
  for (let level = 0; level < levels; level++)
    node = { type: "bulletList", content: [{ type: "listItem", content: [node] }] };
  return { type: "doc", content: [node] };
}

describe("migration input limits", () => {
  it("converts 50,000 paragraphs in each format", () => {
    const words = (index: number) => `Paragraph ${index} — Привет 😀`;
    const lexical = convertLexicalToGoTipe(
      {
        root: {
          type: "root",
          version: 1,
          children: Array.from({ length: size }, (_, index) => ({
            type: "paragraph",
            version: 1,
            direction: "ltr",
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            children: [
              { type: "text", text: words(index), format: 1, detail: 0, mode: "normal", style: "" },
            ],
          })),
        },
      },
      { createId: ids() },
    );
    const prosemirror = convertProseMirrorToGoTipe(
      {
        type: "doc",
        content: Array.from({ length: size }, (_, index) => ({
          type: "paragraph",
          attrs: { textAlign: "left" },
          content: [{ type: "text", text: words(index), marks: [{ type: "bold" }] }],
        })),
      },
      { createId: ids() },
    );
    const slate = convertSlateToGoTipe(
      Array.from({ length: size }, (_, index) => ({
        type: "paragraph",
        children: [{ text: words(index), bold: true }],
      })),
      { createId: ids() },
    );
    for (const result of [lexical, prosemirror, slate]) {
      expect(result.document.blocks).toHaveLength(size);
      expect(result.document.blocks.at(-1)?.content).toEqual([
        { text: words(size - 1), marks: [{ type: "bold", attrs: {} }] },
      ]);
      expect(result.warnings).toEqual([]);
      expect(result.preserved).toEqual([]);
    }
  });

  it("measures depth in nodes, not in JSON levels", () => {
    // Every list level is four JSON levels; 40 levels used to exceed the old limit of 128.
    const result = convertProseMirrorToGoTipe(nestedLists(40), { createId: ids() });
    let block = result.document.blocks[0];
    let depth = 0;
    while (block?.type === "bulletList") {
      depth++;
      block = block.children[0]?.children[0];
    }
    expect(depth).toBe(40);
    expect(result.preserved).toEqual([]);
  });

  it("fails cleanly beyond the node depth, the JSON nesting and the text limits", () => {
    expect(() => convertProseMirrorToGoTipe(nestedLists(70))).toThrow(
      "Migration input nests nodes deeper than 128 levels",
    );
    let attrs: object = { leaf: true };
    for (let level = 0; level < 600; level++) attrs = { nested: attrs };
    expect(() =>
      convertProseMirrorToGoTipe({ type: "doc", content: [{ type: "paragraph", attrs }] }),
    ).toThrow("Migration input nests JSON deeper than 512 levels");
    const long = "x".repeat(32 * 1024 * 1024 + 1);
    expect(() => convertSlateToGoTipe([{ type: "paragraph", children: [{ text: long }] }])).toThrow(
      "UTF-16 code units of text",
    );
  });
});
