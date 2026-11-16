// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { DefaultPreset } from "@gotipe/core/presets";
import type React from "react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BubbleMenu } from "./bubble-menu";
import { EditorContent } from "./editor-content";
import { FloatingMenu } from "./floating-menu";
import { GoTipeI18nProvider } from "./i18n-context";

let editor: GoTipeEditor;
let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no layout: every range is one empty rectangle.
  const rect = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON() {} }) as DOMRect;
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  // jsdom has no `CSS.escape`; the block ids of this test need no escaping.
  if (!globalThis.CSS?.escape) Object.assign(globalThis, { CSS: { escape: String } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  editor = await createEditor({
    extensions: [DefaultPreset],
    content: {
      version: 1,
      blocks: [
        {
          id: "text",
          type: "paragraph",
          attrs: {},
          content: [{ text: "Body", marks: [] }],
          children: [],
        },
        { id: "empty", type: "paragraph", attrs: {}, content: [], children: [] },
      ],
    },
  });
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
});

const content = () => container.querySelector("[data-gotipe-content]");
const bubble = () => document.querySelector("[data-gotipe-bubble-menu]");
const insert = () => container.querySelector(".gotipe-floating-menu");

function draw(node: React.ReactNode, locale?: string) {
  act(() =>
    root.render(locale ? <GoTipeI18nProvider locale={locale}>{node}</GoTipeI18nProvider> : node),
  );
}

/** Selects "Body" in the document, as a person would with the pointer. */
function selectText() {
  const block = container.querySelector('[data-block-id="text"]');
  const text = block && document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
  if (!text) throw new Error("no text node");
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 4);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Puts the caret into the empty paragraph and the focus into the document. */
function focusEmpty() {
  act(() => {
    editor.setSelection({
      anchor: { blockId: "empty", offset: 0 },
      head: { blockId: "empty", offset: 0 },
    });
    (content() as HTMLElement).focus();
  });
}

describe("default names follow GoTipeI18nProvider (D-195)", () => {
  it.each([
    [undefined, "Document content", "Text formatting", "Insert block"],
    ["en", "Document content", "Text formatting", "Insert block"],
    ["ru", "Содержимое документа", "Форматирование текста", "Вставить блок"],
  ])("in %s", (locale, document, formatting, insertBlock) => {
    draw(<EditorContent editor={editor} />, locale);
    expect(content()?.getAttribute("aria-label")).toBe(document);

    selectText();
    draw(
      <>
        <EditorContent editor={editor} />
        <BubbleMenu editor={editor} shouldShow={() => true}>
          <button type="button">B</button>
        </BubbleMenu>
      </>,
      locale,
    );
    expect(bubble()?.getAttribute("aria-label")).toBe(formatting);

    draw(
      <>
        <EditorContent editor={editor} />
        <FloatingMenu editor={editor}>
          <button type="button">+</button>
        </FloatingMenu>
      </>,
      locale,
    );
    focusEmpty();
    expect(insert()?.getAttribute("aria-label")).toBe(insertBlock);
  });

  it("an ariaLabel wins over the interface words", () => {
    draw(<EditorContent editor={editor} ariaLabel="Заметки" />, "ru");
    selectText();
    draw(
      <>
        <EditorContent editor={editor} ariaLabel="Заметки" />
        <BubbleMenu editor={editor} shouldShow={() => true} ariaLabel="Формат">
          <button type="button">B</button>
        </BubbleMenu>
        <FloatingMenu editor={editor} ariaLabel="Новый блок">
          <button type="button">+</button>
        </FloatingMenu>
      </>,
      "ru",
    );
    expect(content()?.getAttribute("aria-label")).toBe("Заметки");
    expect(bubble()?.getAttribute("aria-label")).toBe("Формат");
    focusEmpty();
    expect(insert()?.getAttribute("aria-label")).toBe("Новый блок");
  });
});
