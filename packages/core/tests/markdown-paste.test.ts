import { markdownRawNodeSpec } from "@gotipe/markdown";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BulletList,
  CodeBlock,
  CustomEmoji,
  Heading,
  Image,
  InlineMath,
  Link,
  ListItem,
  MarkdownPaste,
  Mention,
  Paragraph,
  Table,
  TodoList,
  looksLikeMarkdown,
} from "../src/extensions";
import { FullPreset } from "../src/presets";
import type { Block, Document } from "../src/types/block";
import { type Extension, defineExtension } from "../src/types/extension";
import { block, createOn, doc, paragraph } from "./engines";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function setup(
  extensions: (Extension | Extension[])[],
  content: Document = doc(paragraph("p", "ab")),
) {
  const errors = vi.fn();
  const editor = await createOn("js", { extensions, content, host: { onError: errors } });
  const root = document.createElement("div");
  document.body.append(root);
  editor.mount(root);
  cleanups.push(() => {
    editor.destroy();
    root.remove();
  });
  const paste = (data: Record<string, string>) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { files: [], getData: (type: string) => data[type] ?? "" },
    });
    root.dispatchEvent(event);
  };
  const caret = (blockId: string, offset: number) =>
    editor.setSelection({ anchor: { blockId, offset }, head: { blockId, offset } });
  return { editor, paste, caret, errors };
}
const shape = (blocks: Block[]): unknown[] =>
  blocks.map((item) => ({
    type: item.type,
    ...(Object.keys(item.attrs).length ? { attrs: item.attrs } : {}),
    ...(item.content === null ? {} : { content: item.content }),
    ...(item.children.length ? { children: shape(item.children) } : {}),
  }));

describe("Markdown detection", () => {
  it.each([
    ["# Заголовок\n\nтекст", false],
    ["# Заголовок\n\nтекст\n\n## Раздел\n\nещё", true],
    ["- one\n- two", true],
    ["1. one\n2. two", true],
    ["- [ ] task", true],
    ["| a | b |\n|---|:-:|\n| 1 | 2 |", true],
    ["```ts\nlet a = 1;\n```", true],
    ["see [docs](https://example.com)", true],
    ["> one\n> two", true],
    ["# install deps\nnpm install", false],
    ["- a single dash line", false],
    ["Just *some* prose, 1. not a list", false],
    ["a | b", false],
    ["see [guide](./guide.md), [top](#top) or ![logo](/logo.png)", true],
    ["const r = handlers[name](event);\nreturn r * 2 * x;", false],
    ["# Compute totals\n\ndef __init__(self):\n    self.total = a * b", false],
    ["# install deps\n\nnpm i --save-dev __tests__", false],
    ["See note [1](2) for details", false],
    ["call handlers[name](https://example.com)", false],
    ["- one\n- two\n\nlet total = one + two;", false],
    ["- one\n- two\n\n```js\nlet total = one + two;\n```", true],
    ["## Шаги\n\n## Итог", true],
  ])("%j → %s", (text, expected) => {
    expect(looksLikeMarkdown(text)).toBe(expected);
  });

  it("counts mention links only for an editor with mentions", () => {
    expect(looksLikeMarkdown("[@Анна](mention:user-1) решает")).toBe(false);
    expect(looksLikeMarkdown("[@Анна](mention:user-1) решает", { mentions: true })).toBe(true);
  });
});

describe("Markdown paste", () => {
  const extensions = [FullPreset, MarkdownPaste];

  it("pastes Markdown as blocks in one undo step, keeping the text around the caret", async () => {
    const { editor, paste, caret, errors } = await setup(extensions);
    caret("p", 1);
    paste({ "text/plain": "# Привет 😀\r\n\r\n- one\r\n- **two**\r\n\r\n```js\nlet a\n```" });
    expect(errors).not.toHaveBeenCalled();
    expect(shape(editor.getJSON().blocks)).toEqual([
      { type: "paragraph", content: [{ text: "a", marks: [] }] },
      { type: "heading", attrs: { level: 1 }, content: [{ text: "Привет 😀", marks: [] }] },
      {
        // The list keeps how its source was written, for Markdown output.
        type: "bulletList",
        attrs: { marker: "-", spread: false },
        children: [
          { type: "listItem", content: [{ text: "one", marks: [] }] },
          { type: "listItem", content: [{ text: "two", marks: [{ type: "bold", attrs: {} }] }] },
        ],
      },
      { type: "codeBlock", attrs: { language: "js" }, content: "let a" },
      { type: "paragraph", content: [{ text: "b", marks: [] }] },
    ]);
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("ab");
    expect(editor.undo()).toBe(false);
  });

  it("keeps HTML priority and plain text that is not clearly Markdown", async () => {
    const { editor, paste, caret } = await setup(extensions);
    caret("p", 2);
    paste({ "text/plain": "# Title\n\nbody", "text/html": "<p><em>HTML</em></p>" });
    expect(editor.getText()).toBe("abHTML");
    paste({ "text/plain": "# install\nnpm i" });
    expect(editor.getJSON().blocks.map((item) => item.type)).toEqual(["paragraph", "paragraph"]);
    expect(editor.getText()).toBe("abHTML# install\nnpm i");
  });

  it("pastes code and bracketed prose as text: underscores, indents and brackets stay", async () => {
    for (const text of [
      "const r = handlers[name](event);\nreturn r * 2 * x;",
      "# Compute totals\n\ndef __init__(self):\n    self.total = a * b",
      "See note [1](2) for details",
    ]) {
      const { editor, paste } = await setup(extensions, doc(paragraph("p", "")));
      paste({ "text/plain": text });
      expect(editor.getText()).toBe(text);
      const blocks = editor.getJSON().blocks;
      expect(blocks.every((item) => item.type === "paragraph")).toBe(true);
      expect(
        blocks.flatMap((item) =>
          (item.content as { marks: unknown[] }[]).flatMap((span) => span.marks),
        ),
      ).toEqual([]);
    }
  });

  it("pastes inline Markdown into the paragraph and keeps unsafe or unknown marks as source", async () => {
    const { editor, paste, caret } = await setup(extensions);
    caret("p", 1);
    paste({ "text/plain": "[ok](https://example.com) and **b**" });
    expect(editor.getJSON().blocks).toHaveLength(1);
    expect(editor.getJSON().blocks[0]!.content).toEqual([
      { text: "a", marks: [] },
      // As a Markdown document stores it: the address, without editor defaults.
      { text: "ok", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
      { text: " and ", marks: [] },
      { text: "b", marks: [{ type: "bold", attrs: {} }] },
      { text: "b", marks: [] },
    ]);
    editor.undo();
    // Nothing is dropped silently: an unsafe link stays as the text that was pasted.
    paste({ "text/plain": "[bad](javascript:alert(1)) [ok](https://example.com)" });
    expect(editor.getText()).toBe("a[bad](javascript:alert(1)) [ok](https://example.com)b");
    expect(JSON.stringify(editor.getJSON())).not.toContain('"link"');

    const plain = await setup([Paragraph, MarkdownPaste]);
    plain.paste({ "text/plain": "see [docs](https://example.com) and **bold**" });
    expect(plain.editor.getText()).toBe("see [docs](https://example.com) and **bold**ab");
  });

  it("pastes images with safe addresses only and unknown blocks as text", async () => {
    const { editor, paste } = await setup([Paragraph, Heading, Image, Link, MarkdownPaste]);
    paste({
      "text/plain":
        "# Images\n\n![ok](images/a.png)\n\n![bad](javascript:alert(1))\n\n- one\n- two",
    });
    expect(shape(editor.getJSON().blocks)).toEqual([
      { type: "heading", attrs: { level: 1 }, content: [{ text: "Images", marks: [] }] },
      { type: "image", attrs: { src: "images/a.png", alt: "ok", caption: "" } },
      { type: "paragraph", content: [{ text: "![bad](javascript:alert(1))", marks: [] }] },
      { type: "paragraph", content: [{ text: "- one", marks: [] }] },
      { type: "paragraph", content: [{ text: "- two", marks: [] }] },
      { type: "paragraph", content: [{ text: "ab", marks: [] }] },
    ]);
  });

  it("keeps unsupported constructs as raw Markdown when the schema has it", async () => {
    const Raw = defineExtension({ name: "markdownRaw", nodes: [markdownRawNodeSpec] });
    const { editor, paste } = await setup([
      Paragraph,
      BulletList,
      ListItem,
      TodoList,
      Raw,
      MarkdownPaste,
    ]);
    paste({
      "text/plain":
        "---\ntitle: x\n---\n- one\n- two\n\n<div>\nhtml\n</div>\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    });
    const blocks = editor.getJSON().blocks;
    expect(shape(blocks).slice(0, 4)).toEqual([
      { type: "markdownRaw", attrs: { kind: "frontMatter" }, content: "---\ntitle: x\n---" },
      {
        type: "bulletList",
        attrs: { marker: "-", spread: false },
        children: [
          { type: "listItem", content: [{ text: "one", marks: [] }] },
          { type: "listItem", content: [{ text: "two", marks: [] }] },
        ],
      },
      { type: "markdownRaw", attrs: { kind: "html" }, content: "<div>\nhtml\n</div>" },
      { type: "markdownRaw", attrs: { kind: "table" }, content: "| a | b |\n|---|---|\n| 1 | 2 |" },
    ]);
  });

  it("inserts the text itself into code and Markdown that cannot go into a table cell", async () => {
    const cell = (id: string, text: string) => block(id, "tableCell", [{ text, marks: [] }]);
    const content = doc(
      block("c", "codeBlock", "", { language: "" }),
      block("t", "table", null, {}, [block("r", "tableRow", null, {}, [cell("x", "1")])]),
    );
    const { editor, paste, caret } = await setup(
      [Paragraph, CodeBlock, Table, BulletList, ListItem, MarkdownPaste],
      content,
    );
    caret("c", 0);
    paste({ "text/plain": "- one\n- two" });
    expect(editor.getJSON().blocks[0]!.content).toBe("- one\n- two");
    caret("x", 1);
    paste({ "text/plain": "- a\n- b" });
    const row = editor.getJSON().blocks[1]!.children[0]!;
    expect(row.children[0]!.content).toEqual([{ text: "1- a\n- b", marks: [] }]);
  });
});

describe("Markdown paste and inline atoms", () => {
  const text = "[@Анна](mention:user-1) решает $x^2$ и :party:";

  it("reads atoms the schema declares and leaves the text alone without them", async () => {
    const atoms = await setup([
      Paragraph,
      Mention,
      InlineMath,
      CustomEmoji,
      MarkdownPaste.configure({ customEmoji: { party: "https://cdn.test/party.png" } }),
    ]);
    atoms.paste({ "text/plain": text });
    expect(atoms.errors).not.toHaveBeenCalled();
    expect(atoms.editor.getJSON().blocks[0]!.content).toEqual([
      {
        text: "@Анна",
        // The codec's address is `mention:<kind>-<id>`; every atom read gets a unique `key`.
        marks: [{ type: "mention", attrs: { id: "1", kind: "user", label: "Анна", key: "1" } }],
      },
      { text: " решает ", marks: [] },
      { text: "x^2", marks: [{ type: "inlineMath", attrs: { key: "2" } }] },
      { text: " и ", marks: [] },
      {
        text: ":party:",
        marks: [
          {
            type: "customEmoji",
            attrs: { name: "party", src: "https://cdn.test/party.png", key: "3" },
          },
        ],
      },
      { text: "ab", marks: [] },
    ]);
    expect(atoms.editor.undo()).toBe(true);
    expect(atoms.editor.getText()).toBe("ab");

    const plain = await setup([Paragraph, Link, MarkdownPaste]);
    plain.paste({ "text/plain": text });
    expect(plain.editor.getJSON().blocks[0]!.content).toEqual([{ text: `${text}ab`, marks: [] }]);
  });
});

describe("pasted text hooks", () => {
  it("transform, then parse in extension order, with the schema and options", async () => {
    const seen: string[] = [];
    const upper = defineExtension({
      name: "upper",
      transformPastedText: (value) => {
        seen.push(`transform:${value}`);
        return value.toUpperCase();
      },
    });
    const none = defineExtension({
      name: "none",
      parsePastedText: (value) => {
        seen.push(`first:${value}`);
        return null;
      },
    });
    const heading = defineExtension<{ level: number }>({
      name: "asHeading",
      options: { level: 2 },
      parsePastedText: (value, { nodes, options }) => {
        seen.push(`second:${value}`);
        const { level } = options as { level: number };
        return "heading" in nodes
          ? [block("x", "heading", [{ text: value, marks: [] }], { level })]
          : null;
      },
    });
    const { editor, paste } = await setup([Paragraph, Heading, upper, none, heading]);
    paste({ "text/plain": "ёж" });
    expect(seen).toEqual(["transform:ёж", "first:ЁЖ", "second:ЁЖ"]);
    expect(shape(editor.getJSON().blocks)).toEqual([
      { type: "heading", attrs: { level: 2 }, content: [{ text: "ЁЖ", marks: [] }] },
      { type: "paragraph", content: [{ text: "ab", marks: [] }] },
    ]);
    // An empty transform result pastes nothing and keeps the selection's text.
    const empty = defineExtension({ name: "empty", transformPastedText: () => "" });
    const second = await setup([Paragraph, empty]);
    second.editor.setSelection({
      anchor: { blockId: "p", offset: 0 },
      head: { blockId: "p", offset: 2 },
    });
    second.paste({ "text/plain": "x" });
    expect(second.editor.getText()).toBe("ab");
    expect(second.editor.undo()).toBe(false);
  });
});
