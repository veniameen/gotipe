import { afterEach, describe, expect, it } from "vitest";
import { DefaultPreset } from "../src/presets";
import type { Document } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { defineExtension } from "../src/types/extension";
import { ENGINES, type Engine, block, createOn, doc, text } from "./engines";

// D-175: both engines write block and mark attributes — and objects inside them — with their
// keys in code point order, as Rust does (D-82): the same document is the same JSON string.
const Card = defineExtension({
  name: "card",
  nodes: [
    {
      name: "card",
      group: ["block"],
      content: "richText",
      attrs: {
        meta: { type: "object" },
        tags: { type: "array" },
        "\u{1F600}": { type: "string" },
        "\uFF01": { type: "string" },
      },
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
  ],
});

const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

async function open(engine: Engine, content: Document) {
  const editor = await createOn(engine, { extensions: [...DefaultPreset, Card], content });
  editors.push(editor);
  return editor;
}

const link = { type: "link", attrs: { title: "Т", target: "_self", rel: "nofollow", href: "/x" } };
const content = doc(
  block("h", "heading", text("Заголовок"), { level: 2, dir: "rtl" }),
  block("c", "card", [{ text: "ab", marks: [link] }], {
    tags: [{ z: 1, a: 2 }],
    "\u{1F600}": "astral",
    meta: { zeta: 1, alpha: { y: 2, b: 3 } },
    "\uFF01": "fullwidth",
  }),
);

async function edited(engine: Engine) {
  const editor = await open(engine, content);
  editor.dispatch({
    steps: [
      { type: "setBlockAttrs", blockId: "h", attrs: { level: 3, align: "center" } },
      { type: "setBlockType", blockId: "c", newType: "card", attrs: { meta: { b: 1, a: 0 } } },
      {
        type: "addMark",
        blockId: "h",
        from: 0,
        to: 3,
        mark: { type: "link", attrs: { target: "_blank", href: "/y" } },
      },
    ],
  });
  return editor;
}

describe.each(ENGINES)("%s engine: attribute keys in code point order (D-175)", (engine) => {
  it("a loaded document comes back with sorted keys at every level", async () => {
    const editor = await open(engine, content);
    const [heading, card] = editor.getJSON().blocks;
    expect(Object.keys(heading!.attrs)).toEqual(["dir", "level"]);
    // U+1F600 is after U+FF01 by code point, but before it by UTF-16 code unit.
    expect(Object.keys(card!.attrs)).toEqual(["meta", "tags", "\uFF01", "\u{1F600}"]);
    expect(JSON.stringify(card!.attrs.meta)).toBe('{"alpha":{"b":3,"y":2},"zeta":1}');
    expect(JSON.stringify(card!.attrs.tags)).toBe('[{"a":2,"z":1}]');
    const [span] = card!.content as { marks: { attrs: Record<string, unknown> }[] }[];
    expect(Object.keys(span!.marks[0]!.attrs)).toEqual(["href", "rel", "target", "title"]);
  });

  it("attributes a transaction adds or replaces are sorted too", async () => {
    const [heading, card] = (await edited(engine)).getJSON().blocks;
    expect(Object.keys(heading!.attrs)).toEqual(["align", "dir", "level"]);
    expect(JSON.stringify(card!.attrs)).toBe('{"meta":{"a":0,"b":1}}');
    const [span] = heading!.content as { marks: { attrs: Record<string, unknown> }[] }[];
    expect(Object.keys(span!.marks[0]!.attrs)).toEqual(["href", "target"]);
  });
});

it("both engines give the same JSON string for the same edits", async () => {
  const [js, wasm] = await Promise.all(ENGINES.map(edited));
  expect(JSON.stringify(js!.getJSON().blocks)).toBe(JSON.stringify(wasm!.getJSON().blocks));
  expect(js!.getHTML()).toBe(wasm!.getHTML());
});
