// @vitest-environment jsdom
import { InlineMath, Mention, Paragraph, insertMention } from "@gotipe/core/extensions";
import { createEditor } from "@gotipe/core/js";
import { parseTex } from "@gotipe/core/math";
import { afterEach, expect, it } from "vitest";
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
            { text: "Привет ", marks: [] },
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
  expect(documentText(block())).toBe("Привет x^2");
  const formula = block().querySelector<HTMLElement>('[data-gotipe-atom][data-type="inlineMath"]')!;
  expect(formula.getAttribute("contenteditable")).toBe("false");
  expect(formula.getAttribute("role")).toBe("math");
  expect(formula.querySelector("msup")).not.toBeNull();
  editor.setSelection({ anchor: { blockId: "p", offset: 7 }, head: { blockId: "p", offset: 7 } });
  insertMention(editor, { id: "42", label: "Анна😀" });
  await nextTick();
  expect(documentText(block())).toBe("Привет @Анна😀x^2");
  const mention = block().querySelector<HTMLElement>(".gotipe-mention")!;
  expect(mention.dataset.kind).toBe("person");
  expect(mention.querySelector(".gotipe-avatar")!.textContent).toBe("А");
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
