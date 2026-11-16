import {
  Bold,
  BulletList,
  CustomEmoji,
  InlineImage,
  InlineMath,
  ListItem,
  Mention,
  Paragraph,
  TodoList,
  Toggle,
  insertMention,
} from "@gotipe/core/extensions";
// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { parseTex } from "@gotipe/core/math";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MathRendererContext } from "./content/math-renderer";
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

const anna = {
  type: "mention",
  attrs: { id: "u3", label: "Анна Ковалёва", kind: "user", key: "a" },
};
const page = { type: "mention", attrs: { id: "p1", label: "ADR-0031", kind: "page", key: "b" } };
const math = (key: string) => ({ type: "inlineMath", attrs: { key } });

async function open(content: { text: string; marks: object[] }[], formulas = true) {
  editor = await createEditor({
    extensions: [Paragraph, Bold, Mention, InlineMath, CustomEmoji, InlineImage],
    content: {
      version: 1,
      blocks: [{ id: "p", type: "paragraph", attrs: {}, content, children: [] }],
    },
  });
  act(() =>
    root.render(
      <MathRendererContext.Provider value={formulas ? parseTex : null}>
        <EditorContent editor={editor} />
      </MathRendererContext.Provider>,
    ),
  );
}
const block = () => container.querySelector<HTMLElement>('[data-block-id="p"]')!;
/** The block's document text: what the editor counts (widgets left out). */
function documentText(node: Node): string {
  if (node instanceof Element && node.hasAttribute("data-gotipe-widget")) return "";
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
  return Array.from(node.childNodes).map(documentText).join("");
}

describe("inline atom views", () => {
  it("draws a mention as one non-editable chip and keeps its text for offsets", async () => {
    await open([
      { text: "Проверила ", marks: [] },
      { text: "@Анна ", marks: [anna, { type: "bold" }] },
      { text: "Ковалёва", marks: [anna] },
      { text: ", см. ", marks: [] },
      { text: "ADR-0031", marks: [page] },
    ]);
    const chips = block().querySelectorAll<HTMLElement>("[data-gotipe-atom]");
    // Two spans of one atom (one of them bold) are still one element.
    expect(chips).toHaveLength(2);
    const [person, doc] = chips as unknown as HTMLElement[];
    expect(person!.getAttribute("contenteditable")).toBe("false");
    expect(person!.dataset.type).toBe("mention");
    expect(person!.dataset.kind).toBe("person");
    expect(person!.querySelector(".gotipe-avatar")!.textContent).toBe("АК");
    expect(doc!.dataset.kind).toBe("page");
    expect(doc!.querySelector("svg")).not.toBeNull();
    expect(documentText(block())).toBe("Проверила @Анна Ковалёва, см. ADR-0031");
  });

  it("typesets a formula as MathML and shows broken TeX with its reason", async () => {
    await open([
      { text: "p = \\frac{L}{N}", marks: [math("1")] },
      { text: " и ", marks: [] },
      { text: "\\frac{L}{N", marks: [math("2")] },
    ]);
    const [good, bad] = block().querySelectorAll<HTMLElement>(".gotipe-math-inline");
    expect(good!.getAttribute("role")).toBe("math");
    expect(good!.getAttribute("aria-label")).toBe("p = \\frac{L}{N}");
    const mathElement = good!.querySelector("math")!;
    expect(mathElement.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML");
    expect(mathElement.querySelector("mfrac")!.children).toHaveLength(2);
    expect(bad!.classList.contains("is-invalid")).toBe(true);
    expect(bad!.getAttribute("aria-invalid")).toBe("true");
    expect(bad!.querySelector(".gotipe-tooltip")!.textContent).toBe("Missing closing “}”");
    expect(documentText(block())).toBe("p = \\frac{L}{N} и \\frac{L}{N");
  });

  it("shows a formula's TeX without a TeX reader", async () => {
    await open([{ text: "x^2", marks: [math("1")] }], false);
    const formula = block().querySelector<HTMLElement>(".gotipe-math-inline")!;
    expect(formula.getAttribute("aria-label")).toBe("x^2");
    expect(formula.querySelector("math")).toBeNull();
    expect(formula.textContent).toBe("x^2");
  });

  it("draws safe images only", async () => {
    await open([
      {
        text: ":gotipe:",
        marks: [{ type: "customEmoji", attrs: { name: "gotipe", src: "/g.png", key: "1" } }],
      },
      {
        text: "x",
        marks: [{ type: "inlineImage", attrs: { src: "javascript:alert(1)", alt: "x", key: "2" } }],
      },
    ]);
    const emoji = block().querySelector<HTMLElement>(".gotipe-emoji-custom")!;
    expect(emoji.getAttribute("aria-label")).toBe(":gotipe:");
    expect(emoji.querySelector("img")!.getAttribute("src")).toBe("/g.png");
    expect(block().querySelector(".gotipe-inline-image img")).toBeNull();
  });

  it("maps the caret beside an atom, never into its text", async () => {
    await open([
      { text: "@Анна Ковалёва", marks: [anna] },
      { text: " и ", marks: [] },
      { text: "x^2", marks: [math("1")] },
    ]);
    const chip = block().querySelector("[data-gotipe-atom]")!;
    const index = Array.prototype.indexOf.call(chip.parentNode!.childNodes, chip);
    // DOM → model: the boundary before and after the chip.
    for (const [offset, expected] of [
      [index, 0],
      [index + 1, 14],
    ] as const) {
      document.getSelection()!.collapse(chip.parentNode!, offset);
      editor.syncSelectionFromDOM();
      expect(editor.getViewState().selection.head.offset).toBe(expected);
    }
    // Model → DOM: the caret after the formula at the block end stands outside it.
    act(() => {
      editor.focus();
      editor.setSelection({
        anchor: { blockId: "p", offset: 20 },
        head: { blockId: "p", offset: 20 },
      });
    });
    const selection = document.getSelection()!;
    const at = selection.anchorNode;
    if (at && block().contains(at)) {
      const element = at instanceof Element ? at : at.parentElement!;
      expect(element.closest("[data-gotipe-atom]")).toBeNull();
    }
  });

  it("removes an atom whole with Backspace after it", async () => {
    await open([
      { text: "Привет ", marks: [] },
      { text: "x^2", marks: [math("1")] },
    ]);
    act(() => {
      editor.focus();
      editor.setSelection({
        anchor: { blockId: "p", offset: 10 },
        head: { blockId: "p", offset: 10 },
      });
    });
    act(() => {
      editor.element!.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "deleteContentBackward",
        }),
      );
    });
    expect(documentText(block())).toBe("Привет ");
    expect(block().querySelector("[data-gotipe-atom]")).toBeNull();
  });

  it("inserts a mention through the command", async () => {
    await open([{ text: "Привет ", marks: [] }]);
    editor.setSelection({ anchor: { blockId: "p", offset: 7 }, head: { blockId: "p", offset: 7 } });
    act(() => {
      insertMention(editor, { id: "42", label: "Анна😀" });
    });
    expect(documentText(block())).toBe("Привет @Анна😀");
    expect(block().querySelector(".gotipe-mention")!.textContent).toContain("Анна😀");
  });
});

describe("an atom at the end of a block with nested blocks", () => {
  const mention = { text: "@Анна", marks: [{ ...anna, attrs: { ...anna.attrs, label: "Анна" } }] };
  const own = [{ text: "a ", marks: [] }, mention];
  const leaf = (id: string, type: string, text: string) => ({
    id,
    type,
    attrs: type === "todoItem" ? { checked: false } : {},
    content: [{ text, marks: [] }],
    children: [],
  });
  const list = (container: string, item: string) => ({
    id: "list",
    type: container,
    attrs: {},
    content: null,
    children: [
      {
        id: "parent",
        type: item,
        attrs: item === "todoItem" ? { checked: false } : {},
        content: own,
        children: [
          {
            id: "nested",
            type: container,
            attrs: {},
            content: null,
            children: [leaf("child", item, "child")],
          },
        ],
      },
    ],
  });
  const toggle = {
    id: "parent",
    type: "toggle",
    attrs: { open: true },
    content: own,
    children: [leaf("child", "paragraph", "child")],
  };
  it.each([
    ["list item", list("bulletList", "listItem")],
    ["todo item", list("todoList", "todoItem")],
    ["toggle", toggle],
  ])("keeps the caret in the %s, after the atom", async (_name, block) => {
    editor = await createEditor({
      extensions: [Paragraph, BulletList, ListItem, TodoList, Toggle, Mention],
      content: { version: 1, blocks: [block] },
    });
    act(() => root.render(<EditorContent editor={editor} />));
    act(() => {
      editor.focus();
      editor.setSelection({
        anchor: { blockId: "parent", offset: 7 },
        head: { blockId: "parent", offset: 7 },
      });
    });
    const at = document.getSelection()!.anchorNode!;
    const element = at instanceof Element ? at : at.parentElement!;
    expect(element.closest("[data-block-id]")!.getAttribute("data-block-id")).toBe("parent");
    expect(element.closest("[data-gotipe-atom]")).toBeNull();
    editor.syncSelectionFromDOM();
    expect(editor.getViewState().selection.head).toEqual({ blockId: "parent", offset: 7 });
  });
});

describe("an IME composition right after an atom (D-226)", () => {
  /**
   * What the browser does while an IME composes: marked text at its own caret, then the commit.
   * The atom's document text stays in the line (`HIDDEN`), so the caret beside it is a text place.
   */
  const compose = (text: string) => {
    const target = editor.element!;
    const range = document.getSelection()!.getRangeAt(0);
    target.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    const { startContainer: node, startOffset: offset } = range;
    if (node.nodeType === Node.TEXT_NODE) (node as Text).insertData(offset, text);
    else node.insertBefore(document.createTextNode(text), node.childNodes[offset] ?? null);
    target.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: text }));
    target.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text }));
  };
  const before = { text: "Ёж 😀 ", marks: [] };
  it.each([
    ["mention", { text: "@Анна Ковалёва", marks: [anna] }, " и всё"],
    ["mention", { text: "@Анна Ковалёва", marks: [anna] }, ""],
    ["page", { text: "ADR-0031", marks: [page] }, ""],
    ["formula", { text: "x^2", marks: [math("1")] }, " и всё"],
    ["formula", { text: "x^2", marks: [math("1")] }, ""],
  ])("puts the text after the %s, then the caret (tail «%#»)", async (_name, atom, tail) => {
    await open([before, atom, ...(tail ? [{ text: tail, marks: [] }] : [])]);
    const end = before.text.length + atom.text.length;
    act(() => {
      editor.focus();
      editor.setSelection({
        anchor: { blockId: "p", offset: end },
        head: { blockId: "p", offset: end },
      });
    });
    // The DOM caret stands beside the atom, not in its text: the browser composes there.
    const at = document.getSelection()!.anchorNode!;
    expect(block().contains(at)).toBe(true);
    expect(
      (at instanceof Element ? at : at.parentElement!).closest("[data-gotipe-atom]"),
    ).toBeNull();
    act(() => compose("漢字"));
    expect(editor.getJSON().blocks[0]!.content).toEqual([
      before,
      atom,
      { text: `漢字${tail}`, marks: [] },
    ]);
    expect(editor.getViewState().selection.head).toEqual({ blockId: "p", offset: end + 2 });
    expect(documentText(block())).toBe(`${before.text}${atom.text}漢字${tail}`);
    expect(block().querySelectorAll("[data-gotipe-atom]")).toHaveLength(1);
  });
});
