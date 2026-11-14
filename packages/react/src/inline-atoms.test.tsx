import { Bold, InlineMath, Mention, Paragraph, insertMention } from "@gotipe/core/extensions";
// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EditorContent } from "./editor-content";

let editor: GoTipeEditor;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  editor?.destroy();
  container.remove();
});

// Atom views wait for the Atlas frames; until then an atom renders as its fallback text.
it("renders inline atoms as their fallback text", async () => {
  editor = await createEditor({
    extensions: [Paragraph, Bold, Mention, InlineMath],
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
  act(() => root.render(<EditorContent editor={editor} />));
  const block = () => container.querySelector('[data-block-id="p"]')!;
  expect(block().textContent).toBe("Привет x^2");
  editor.setSelection({ anchor: { blockId: "p", offset: 7 }, head: { blockId: "p", offset: 7 } });
  act(() => {
    insertMention(editor, { id: "42", label: "Анна😀" });
  });
  expect(block().textContent).toBe("Привет @Анна😀x^2");
});
