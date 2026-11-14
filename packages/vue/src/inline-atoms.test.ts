// @vitest-environment jsdom
import { InlineMath, Mention, Paragraph, insertMention } from "@gotipe/core/extensions";
import { createEditor } from "@gotipe/core/js";
import { afterEach, expect, it } from "vitest";
import { type App, createApp, h, nextTick, shallowRef } from "vue";
import { EditorContent } from "./editor-content";

const apps: App[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  document.body.replaceChildren();
});

// Atom views wait for the Atlas frames; until then an atom renders as its fallback text.
it("renders inline atoms as their fallback text", async () => {
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
  const app = createApp({ setup: () => () => h(EditorContent, { editor: shallowRef(editor) }) });
  apps.push(app);
  app.mount(root);
  await nextTick();
  const block = () => root.querySelector('[data-block-id="p"]')!;
  expect(block().textContent).toBe("Привет x^2");
  editor.setSelection({ anchor: { blockId: "p", offset: 7 }, head: { blockId: "p", offset: 7 } });
  insertMention(editor, { id: "42", label: "Анна😀" });
  await nextTick();
  expect(block().textContent).toBe("Привет @Анна😀x^2");
  editor.destroy();
});
