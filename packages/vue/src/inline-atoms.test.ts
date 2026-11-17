// @vitest-environment jsdom
import { InlineMath, Mention, Paragraph, insertMention } from "@gotipe/core/extensions";
import { createEditor } from "@gotipe/core/js";
import { parseTex } from "@gotipe/core/math";
import { afterEach, describe, expect, it } from "vitest";
import { type App, createApp, h, nextTick, shallowRef } from "vue";
import { EditorContent } from "./editor-content";

const apps: App[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  document.body.replaceChildren();
});

/** The block's document text: what the editor counts (widgets left out). */
function documentText(node: Node): string {
  if (node instanceof Element && node.hasAttribute("data-gotipe-widget")) return "";
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
  return Array.from(node.childNodes).map(documentText).join("");
}

it("renders inline atoms as one non-editable element each", async () => {
  const editor = await createEditor({
    extensions: [Paragraph, Mention, InlineMath],
    engine: "js",
    content: {
      version: 1,
      blocks: [
        {
          id: "p",
          type: "paragraph",
          attrs: {},
          content: [
            { text: "Hello, ", marks: [] },
            { text: "x^2", marks: [{ type: "inlineMath", attrs: {} }] },
          ],
          children: [],
        },
      ],
    },
  });
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp({
    setup: () => () => h(EditorContent, { editor: shallowRef(editor), math: { parse: parseTex } }),
  });
  apps.push(app);
  app.mount(root);
  await nextTick();
  const block = () => root.querySelector('[data-block-id="p"]')!;
  expect(documentText(block())).toBe("Hello, x^2");
  const formula = block().querySelector<HTMLElement>('[data-gotipe-atom][data-type="inlineMath"]')!;
  expect(formula.getAttribute("contenteditable")).toBe("false");
  expect(formula.getAttribute("role")).toBe("math");
  expect(formula.querySelector("msup")).not.toBeNull();
  editor.setSelection({ anchor: { blockId: "p", offset: 7 }, head: { blockId: "p", offset: 7 } });
  insertMention(editor, { id: "42", label: "Anna😀" });
  await nextTick();
  expect(documentText(block())).toBe("Hello, @Anna😀x^2");
  const mention = block().querySelector<HTMLElement>(".gotipe-mention")!;
  expect(mention.dataset.kind).toBe("person");
  expect(mention.querySelector(".gotipe-avatar")!.textContent).toBe("A");
  editor.destroy();
});

it("draws a page mention with its glyph, and a formula as TeX without `math`", async () => {
  const editor = await createEditor({
    extensions: [Paragraph, Mention, InlineMath],
    engine: "js",
    content: {
      version: 1,
      blocks: [
        {
          id: "p",
          type: "paragraph",
          attrs: {},
          content: [
            {
              text: "ADR",
              marks: [
                { type: "mention", attrs: { id: "p1", label: "ADR", kind: "page", key: "1" } },
              ],
            },
            { text: " ", marks: [] },
            { text: "x^2", marks: [{ type: "inlineMath", attrs: { key: "2" } }] },
          ],
          children: [],
        },
      ],
    },
  });
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp({ setup: () => () => h(EditorContent, { editor: shallowRef(editor) }) });
  apps.push(app);
  app.mount(root);
  await nextTick();
  const page = root.querySelector<HTMLElement>('.gotipe-mention[data-kind="page"]')!;
  expect(page.querySelector("svg")).not.toBeNull();
  const formula = root.querySelector<HTMLElement>(".gotipe-math-inline")!;
  expect(formula.querySelector("math")).toBeNull();
  expect(formula.textContent).toBe("x^2");
  editor.destroy();
});

describe("an IME composition right after an atom (D-226)", () => {
  const anna = {
    type: "mention",
    attrs: { id: "u3", label: "Anna Kovaleva", kind: "user", key: "a" },
  };
  const page = { type: "mention", attrs: { id: "p1", label: "ADR-0031", kind: "page", key: "b" } };
  const formula = { type: "inlineMath", attrs: { key: "1" } };
  const before = { text: "Ёж 😀 ", marks: [] };
  /** What the browser does while an IME composes: marked text at its own caret, then the commit. */
  const compose = (target: HTMLElement, text: string) => {
    const range = document.getSelection()!.getRangeAt(0);
    target.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    const { startContainer: node, startOffset: offset } = range;
    if (node.nodeType === Node.TEXT_NODE) (node as Text).insertData(offset, text);
    else node.insertBefore(document.createTextNode(text), node.childNodes[offset] ?? null);
    target.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: text }));
    target.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text }));
  };
  it.each([
    ["mention", { text: "@Anna Kovaleva", marks: [anna] }, " and all"],
    ["mention", { text: "@Anna Kovaleva", marks: [anna] }, ""],
    ["page", { text: "ADR-0031", marks: [page] }, ""],
    ["formula", { text: "x^2", marks: [formula] }, " and all"],
    ["formula", { text: "x^2", marks: [formula] }, ""],
  ])("puts the text after the %s, then the caret (tail “%#”)", async (_name, atom, tail) => {
    const editor = await createEditor({
      extensions: [Paragraph, Mention, InlineMath],
      engine: "js",
      content: {
        version: 1,
        blocks: [
          {
            id: "p",
            type: "paragraph",
            attrs: {},
            content: [before, atom, ...(tail ? [{ text: tail, marks: [] }] : [])],
            children: [],
          },
        ],
      },
    });
    const root = document.createElement("div");
    document.body.append(root);
    const app = createApp({
      setup: () => () =>
        h(EditorContent, { editor: shallowRef(editor), math: { parse: parseTex } }),
    });
    apps.push(app);
    app.mount(root);
    await nextTick();
    const block = () => root.querySelector('[data-block-id="p"]')!;
    const end = before.text.length + atom.text.length;
    editor.focus();
    editor.setSelection({
      anchor: { blockId: "p", offset: end },
      head: { blockId: "p", offset: end },
    });
    await nextTick();
    // The DOM caret stands beside the atom, not in its text: the browser composes there.
    const at = document.getSelection()!.anchorNode!;
    expect(block().contains(at)).toBe(true);
    expect(
      (at instanceof Element ? at : at.parentElement!).closest("[data-gotipe-atom]"),
    ).toBeNull();
    compose(editor.element!, "漢字");
    await nextTick();
    expect(editor.getJSON().blocks[0]!.content).toEqual([
      before,
      atom,
      { text: `漢字${tail}`, marks: [] },
    ]);
    expect(editor.getViewState().selection.head).toEqual({ blockId: "p", offset: end + 2 });
    expect(documentText(block())).toBe(`${before.text}${atom.text}漢字${tail}`);
    expect(block().querySelectorAll("[data-gotipe-atom]")).toHaveLength(1);
    editor.destroy();
  });
});
