// @vitest-environment jsdom
import {
  FontFamily,
  FontSize,
  InvisibleCharacters,
  TextAlign,
  getTextAlign,
} from "@gotipe/core/extensions";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { DefaultPreset } from "@gotipe/core/presets";
import { GoTipeI18nProvider } from "@gotipe/react";
import { type ReactNode, act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FixedToolbar } from "./fixed-toolbar";

let container: HTMLDivElement;
let root: Root;
const editors: GoTipeEditor[] = [];
const frame = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 40)));
const FULL = [DefaultPreset, TextAlign, FontFamily, FontSize, InvisibleCharacters];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const rect = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON() {} }) as DOMRect;
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  for (const editor of editors.splice(0)) editor.destroy();
  container.remove();
});

async function editorWith(texts: string[], extensions: unknown[] = FULL) {
  const editor = await createEditor({
    extensions: extensions as Parameters<typeof createEditor>[0]["extensions"],
    content: {
      version: 1,
      blocks: texts.map((text, index) => ({
        id: `p${index}`,
        type: "paragraph",
        attrs: {},
        content: text ? [{ text, marks: [] }] : [],
        children: [],
      })),
    },
  });
  editors.push(editor);
  return editor;
}

function show(node: ReactNode) {
  act(() => root.render(<GoTipeI18nProvider locale="ru">{node}</GoTipeI18nProvider>));
}
const click = (element: Element | null | undefined) =>
  act(() => {
    (element as HTMLElement).click();
  });
const press = (target: Element, key: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
const select = (editor: GoTipeEditor, blockId: string, from: number, to: number) =>
  act(() =>
    editor.setSelection({ anchor: { blockId, offset: from }, head: { blockId, offset: to } }),
  );
const tool = (selector: string) => container.querySelector<HTMLButtonElement>(selector)!;
/** What an unavailable tool says: its tooltip, the one aria-describedby names. */
const reason = (button: Element) => {
  if (button.getAttribute("aria-disabled") !== "true") return null;
  const id = button.getAttribute("aria-describedby");
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
};
/** The text spans of a block of the document (code holds a plain string). */
const spans = (block: { content?: unknown } | undefined) =>
  Array.isArray(block?.content)
    ? (block.content as { text: string; marks?: { type: string }[] }[])
    : [];
const units = () =>
  [...container.querySelectorAll("[data-gotipe-unit]")].map((unit) =>
    unit.getAttribute("data-gotipe-unit"),
  );

describe("FixedToolbar", () => {
  it("draws the bar of Atlas frame 31 in its order, one toolbar with its name", async () => {
    const editor = await editorWith(["Правка без сети"]);
    show(<FixedToolbar editor={editor} />);
    const bar = container.querySelector('[role="toolbar"]')!;
    expect(bar.getAttribute("aria-label")).toBe("Форматирование");
    expect(units()).toEqual([
      "history",
      "blockType",
      "font",
      "marks",
      "moreMarks",
      "align",
      "lists",
      "todo",
      "insert",
      "invisibles",
    ]);
    // a hairline between the six groups before the free space; nothing went to “More”
    expect(container.querySelectorAll("hr.gotipe-fixed-toolbar-sep")).toHaveLength(5);
    expect(container.querySelector(".gotipe-fixed-toolbar-more")).toBeNull();
  });

  it("leaves out what the editor lacks and what the host hides", async () => {
    const plain = await editorWith(["Правка"], [DefaultPreset]);
    show(<FixedToolbar editor={plain} />);
    expect(units()).not.toContain("font");
    expect(units()).not.toContain("invisibles");
    expect(units()).toContain("align");

    const full = await editorWith(["Правка"]);
    show(
      <FixedToolbar editor={full} hide={["insert", "font"]}>
        <button type="button">Тема</button>
      </FixedToolbar>,
    );
    expect(units()).toEqual([
      "history",
      "blockType",
      "marks",
      "moreMarks",
      "align",
      "lists",
      "todo",
      "invisibles",
      "host",
    ]);
    expect(container.querySelector('[data-gotipe-unit="host"]')?.textContent).toBe("Тема");
  });

  it("marks the selection, and shows what is on as pressed", async () => {
    const editor = await editorWith(["Правка без сети"]);
    show(<FixedToolbar editor={editor} />);
    select(editor, "p0", 0, 6);
    const bold = tool('[data-mark="bold"]');
    expect(bold.getAttribute("aria-pressed")).toBe("false");
    expect(bold.getAttribute("aria-keyshortcuts")).toBe("Meta+B");
    await click(bold);
    expect(spans(editor.getJSON().blocks[0])[0]?.marks).toEqual([{ type: "bold", attrs: {} }]);
    expect(bold.getAttribute("aria-pressed")).toBe("true");
  });

  it("says why a tool can't act, and the tool does nothing", async () => {
    const editor = await editorWith(["Правка без сети"]);
    show(<FixedToolbar editor={editor} />);
    const undo = tool('[data-history="undo"]');
    expect(reason(undo)).toBe("Нечего отменять");
    expect(reason(tool('[data-history="redo"]'))).toBe("Нечего повторять");

    select(editor, "p0", 0, 6);
    await click(tool('[data-mark="italic"]'));
    expect(reason(undo)).toBeNull();

    // a quote takes no alignment: the list does not open
    act(() => editor.chain().setBlockType("blockquote").run());
    const align = tool('[aria-label="Выравнивание"]');
    expect(reason(align)).toBe("Выравниваются абзацы и заголовки");
    await click(align);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(getTextAlign(editor)).toBeNull();

    // code takes no marks
    act(() => editor.chain().setBlockType("codeBlock").run());
    expect(reason(tool('[data-mark="bold"]'))).toBe("Этот блок без форматирования");
    expect(reason(tool('[data-mark="link"]'))).toBe("Этот блок без форматирования");

    // read-only: everything that changes the document says so; ¶ still works
    act(() => editor.setEditable(false));
    expect(reason(tool('[data-mark="bold"]'))).toBe("Только чтение");
    expect(reason(tool("[data-gotipe-insert]"))).toBe("Только чтение");
    expect(reason(tool('[data-list="bulletList"]'))).toBe("Только чтение");
    expect(tool(".gotipe-invisibles-toggle").getAttribute("aria-disabled")).toBeNull();
  });

  it("keeps the block type for text and shows the list by its own button", async () => {
    const editor = await editorWith(["Правка"]);
    show(<FixedToolbar editor={editor} />);
    select(editor, "p0", 2, 2);
    const bullets = tool('[data-list="bulletList"]');
    await click(bullets);
    expect(editor.getJSON().blocks[0]?.type).toBe("bulletList");
    expect(bullets.getAttribute("aria-pressed")).toBe("true");
    expect(tool(".gotipe-block-type-trigger").textContent).toBe("Текст");
  });

  it("inserts a block after the caret's block in one undo step", async () => {
    const editor = await editorWith(["Правка без сети"]);
    show(<FixedToolbar editor={editor} />);
    select(editor, "p0", 3, 3);
    await click(tool("[data-gotipe-insert]"));
    await frame();
    const menu = container.querySelector('[role="menu"]')!;
    expect([...menu.querySelectorAll(".gotipe-menu-label")].map((l) => l.textContent)).toEqual([
      "Блоки",
      "Медиа",
    ]);
    const kinds = [...menu.querySelectorAll("[data-insert]")].map((item) =>
      item.getAttribute("data-insert"),
    );
    expect(kinds.slice(0, 6)).toEqual([
      "quote",
      "alert-circle",
      "chevron-right",
      "code",
      "table",
      "minus",
    ]);
    expect(kinds).toContain("image");
    await click(menu.querySelector('[data-insert="quote"]'));
    const blocks = editor.getJSON().blocks;
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "blockquote"]);
    expect(spans(blocks[0])[0]?.text).toBe("Правка без сети");
    expect(editor.getViewState().selection.anchor.blockId).toBe(blocks[1]?.id);
    act(() => {
      editor.undo();
    });
    expect(editor.getJSON().blocks.map((block) => block.type)).toEqual(["paragraph"]);
  });

  it("is one Tab stop; the arrows, Home and End move between the tools", async () => {
    const editor = await editorWith(["Правка"]);
    show(<FixedToolbar editor={editor} />);
    await frame();
    const controls = [
      ...container.querySelectorAll<HTMLElement>(".gotipe-fixed-toolbar-track button, input"),
    ];
    expect(controls.filter((control) => control.tabIndex === 0)).toHaveLength(1);
    const first = controls[0]!;
    // the first tool can't act yet (nothing to undo) and still takes the focus
    expect(first.getAttribute("aria-disabled")).toBe("true");
    act(() => first.focus());
    await press(first, "ArrowRight");
    expect(document.activeElement).toBe(controls[1]);
    await press(controls[1]!, "End");
    expect(document.activeElement).toBe(controls.at(-1));
    await press(controls.at(-1)!, "ArrowRight");
    expect(document.activeElement).toBe(first);
    await press(first, "ArrowLeft");
    expect(document.activeElement).toBe(controls.at(-1));
    await press(controls.at(-1)!, "Home");
    expect(document.activeElement).toBe(first);
    expect(controls.filter((control) => control.tabIndex === 0)).toEqual([first]);
  });

  it("sends what does not fit to “More”, a second bar under its button", async () => {
    // jsdom has no layout: the units measure as the frame draws them on a 375 px phone
    const widths: Record<string, number> = {
      history: 58,
      blockType: 65,
      font: 196,
      marks: 88,
      moreMarks: 118,
      align: 48,
      lists: 58,
      todo: 28,
      insert: 108,
      invisibles: 28,
    };
    const rect = HTMLElement.prototype.getBoundingClientRect;
    const client = Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth");
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const width = widths[this.getAttribute("data-gotipe-unit") ?? ""] ?? 0;
      return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: 0, width, height: 0 } as DOMRect;
    };
    Object.defineProperty(Element.prototype, "clientWidth", {
      configurable: true,
      get(this: Element) {
        return this.classList.contains("gotipe-fixed-toolbar-track") ? 351 : 0;
      },
    });
    try {
      const editor = await editorWith(["Правка без сети"]);
      show(<FixedToolbar editor={editor} />);
      await frame();
      const track = container.querySelector(".gotipe-fixed-toolbar-track")!;
      const panel = container.querySelector<HTMLElement>(".gotipe-fixed-toolbar-panel")!;
      const inside = (element: Element) =>
        [...element.querySelectorAll("[data-gotipe-unit]")].map((unit) =>
          unit.getAttribute("data-gotipe-unit"),
        );
      expect(inside(track)).toEqual(["history", "blockType", "marks", "lists"]);
      expect(inside(panel)).toEqual(["font", "moreMarks", "align", "todo", "insert", "invisibles"]);
      expect(panel.querySelectorAll(".gotipe-fixed-toolbar-row")).toHaveLength(2);

      const more = tool(".gotipe-fixed-toolbar-more");
      expect(more.getAttribute("aria-label")).toBe("Ещё");
      expect(more.getAttribute("aria-expanded")).toBe("false");
      expect(more.getAttribute("aria-controls")).toBe(panel.id);
      expect(panel.inert).toBe(true);

      act(() => more.focus());
      await press(more, "ArrowDown");
      await frame();
      expect(more.getAttribute("aria-expanded")).toBe("true");
      expect(panel.hasAttribute("data-open")).toBe(true);
      expect(panel.inert).toBe(false);
      expect(panel.contains(document.activeElement)).toBe(true);

      // a tool in “More” acts like one in the bar
      select(editor, "p0", 0, 6);
      await click(panel.querySelector('[data-mark="strikethrough"]'));
      expect(spans(editor.getJSON().blocks[0])[0]?.marks?.[0]?.type).toBe("strikethrough");

      act(() => panel.querySelector<HTMLElement>("button")?.focus());
      await press(panel.querySelector("button")!, "Escape");
      expect(more.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(more);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = rect;
      if (client) Object.defineProperty(Element.prototype, "clientWidth", client);
    }
  });
});
