// @vitest-environment jsdom
import { Paragraph } from "@gotipe/core/extensions";
import { History } from "@gotipe/core/extensions";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { EditorContent, GoTipeI18nProvider } from "@gotipe/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageEditor } from "../page/page-editor";
import { AtomProvider, AtomUI } from "./atom-ui";
import { atomExtensions } from "./extensions";
import { type MentionItem, requestAtomUI } from "./host";

let container: HTMLDivElement;
let root: Root;
const editors: GoTipeEditor[] = [];
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 10)));

beforeEach(() => {
  // jsdom has neither layout nor `CSS.escape`.
  (globalThis as { CSS?: { escape(value: string): string } }).CSS ??= {
    escape: (value) => value.replace(/["\\\]]/g, "\\$&"),
  };
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const rect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON() {},
  };
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  for (const editor of editors.splice(0)) editor.destroy();
  container.remove();
});

const PEOPLE: MentionItem[] = [
  { id: "u3", label: "Анна Ковалёва" },
  { id: "u1", label: "Андрей Соколов" },
  { id: "u2", label: "Ольга Антонова" },
  { id: "p1", label: "Анализ обращений за октябрь", kind: "page" },
];
const mentions = {
  items: (query: string) =>
    PEOPLE.filter((item) =>
      item.label
        .toLowerCase()
        .split(" ")
        .some((w) => w.startsWith(query.toLowerCase())),
    ),
};

async function open(text: string, props: Partial<Parameters<typeof AtomUI>[0]> = {}) {
  const editor = await createEditor({
    extensions: [Paragraph, History, ...atomExtensions()],
    content: {
      version: 1,
      blocks: [
        { id: "p", type: "paragraph", attrs: {}, content: [{ text, marks: [] }], children: [] },
      ],
    },
  });
  editors.push(editor);
  act(() =>
    root.render(
      <GoTipeI18nProvider locale="ru">
        <AtomProvider mentions={mentions}>
          <EditorContent editor={editor} />
          <AtomUI editor={editor} {...props} />
        </AtomProvider>
      </GoTipeI18nProvider>,
    ),
  );
  await settle();
  return editor;
}
const caretAt = (editor: GoTipeEditor, offset: number) =>
  act(() => {
    editor.focus();
    editor.setSelection({ anchor: { blockId: "p", offset }, head: { blockId: "p", offset } });
  });
const key = (editor: GoTipeEditor, name: string) =>
  act(() => {
    editor.element!.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
    );
  });
const type = (editor: GoTipeEditor, data: string) =>
  act(() => {
    editor.element!.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data,
      }),
    );
  });
const spans = (editor: GoTipeEditor) =>
  editor.getJSON().blocks[0]!.content as {
    text: string;
    marks: { type: string; attrs: Record<string, unknown> }[];
  }[];
const rows = () => Array.from(document.querySelectorAll<HTMLElement>(".gotipe-suggest-item"));

describe("the “@” list", () => {
  it("lists people and pages with the match in bold and inserts the chosen one", async () => {
    const editor = await open("Смотрит @ан");
    caretAt(editor, 11);
    await settle();
    const list = document.querySelector('[role="listbox"]')!;
    expect(list.getAttribute("aria-label")).toBe("Упоминания");
    expect(
      Array.from(document.querySelectorAll(".gotipe-suggest-label"), (n) => n.textContent),
    ).toEqual(["Люди", "Страницы"]);
    expect(rows().map((row) => row.querySelector("mark")?.textContent)).toEqual([
      "Ан",
      "Ан",
      "Ан",
      "Ан",
    ]);
    expect(rows()[0]!.getAttribute("aria-selected")).toBe("true");
    expect(rows()[0]!.textContent).toContain("↵");
    key(editor, "ArrowDown");
    expect(rows()[1]!.getAttribute("aria-selected")).toBe("true");
    key(editor, "Enter");
    await settle();
    expect(spans(editor)[1]).toMatchObject({
      text: "@Андрей Соколов",
      marks: [{ type: "mention", attrs: { id: "u1" } }],
    });
    expect(document.querySelector(".gotipe-suggest")).toBeNull();
  });

  it("says when no one is found and closes on Escape", async () => {
    const editor = await open("Смотрит @юрист");
    caretAt(editor, 14);
    await settle();
    expect(document.querySelector(".gotipe-suggest-empty")!.textContent).toBe("Никого не найдено");
    key(editor, "Escape");
    await settle();
    expect(document.querySelector(".gotipe-suggest")).toBeNull();
  });

  it("chooses a row with the pointer", async () => {
    const editor = await open("@ол");
    caretAt(editor, 3);
    await settle();
    act(() => rows()[0]!.click());
    expect(spans(editor)[0]).toMatchObject({ text: "@Ольга Антонова" });
  });
});

describe("emoji", () => {
  it("lists emoji by their Russian names after “:” and inserts the character", async () => {
    const editor = await open("Готово :пра");
    caretAt(editor, 11);
    await settle();
    const names = rows().map((row) => row.querySelector(".gotipe-suggest-text")!.textContent);
    expect(names).toEqual(expect.arrayContaining(["праздник", "правильно", "правка", "направо"]));
    const index = names.indexOf("праздник");
    for (let i = 0; i < index; i++) key(editor, "ArrowDown");
    key(editor, "Enter");
    expect(editor.getText()).toBe("Готово 🎉");
  });

  it("opens the picker, finds by name, inserts and remembers the emoji", async () => {
    const onRecentChange = vi.fn();
    const editor = await open("Спасибо ", { emoji: { onRecentChange } });
    caretAt(editor, 8);
    act(() => {
      requestAtomUI(editor, { type: "emojiPicker", at: { blockId: "p", from: 8, to: 8 } });
    });
    await settle();
    const picker = document.querySelector<HTMLElement>('[role="dialog"].gotipe-emoji-picker')!;
    expect(picker.getAttribute("aria-label")).toBe("Эмодзи");
    const field = picker.querySelector("input")!;
    expect(document.activeElement).toBe(field);
    expect(picker.querySelectorAll('[role="tab"]').length).toBe(8);
    // Arrow keys walk the grid; the focused cell names itself.
    act(() =>
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
    );
    act(() =>
      (document.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect((document.activeElement as HTMLElement).dataset.cell).toBe("0:1");
    expect(picker.querySelector(".gotipe-emoji-tip")!.textContent).toBe(
      (document.activeElement as HTMLElement).getAttribute("aria-label"),
    );
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(field, "задум");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const cell = picker.querySelector<HTMLElement>('[aria-label="задумчивое лицо"]')!;
    act(() => cell.click());
    expect(editor.getText()).toBe("Спасибо 🤔");
    expect(onRecentChange).toHaveBeenCalledWith(["🤔"]);
    expect(document.querySelector(".gotipe-emoji-picker")).toBeNull();
  });
});

describe("the picker and input methods", () => {
  it("ignores Enter and arrows while composing in the search field", async () => {
    const editor = await open("Спасибо ");
    caretAt(editor, 8);
    act(() => {
      requestAtomUI(editor, { type: "emojiPicker", at: { blockId: "p", from: 8, to: 8 } });
    });
    await settle();
    const field = document.querySelector<HTMLInputElement>(".gotipe-emoji-picker input")!;
    for (const key of ["Enter", "ArrowDown"])
      act(() => {
        field.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, isComposing: true }),
        );
      });
    expect(editor.getText()).toBe("Спасибо ");
    expect(document.activeElement).toBe(field);
  });
});

describe("“/” commands", () => {
  it("open the picker after the menu has returned the focus to the editor", async () => {
    const editor = await open("Спасибо ");
    caretAt(editor, 8);
    const command = editor.getSlashCommands().find((item) => item.icon === "smile")!;
    act(() => {
      command.execute(editor);
      // The slash menu focuses the editor right after running a command.
      editor.focus();
    });
    await settle();
    expect(document.activeElement).toBe(document.querySelector(".gotipe-emoji-picker input"));
    const formula = editor.getSlashCommands().find((item) => item.icon === "function")!;
    expect(formula).toBeDefined();
  });
});

describe("the formula popover", () => {
  const field = () => document.querySelector<HTMLInputElement>(".gotipe-math-pop input")!;
  const setValue = (value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        field(),
        value,
      );
      field().dispatchEvent(new Event("input", { bubbles: true }));
    });
  const press = (name: string) =>
    act(() =>
      field().dispatchEvent(
        new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
      ),
    );

  it("inserts a formula with a live preview, in one undo step", async () => {
    const editor = await open("Доля ");
    caretAt(editor, 5);
    act(() => {
      requestAtomUI(editor, { type: "math", insert: { blockId: "p", from: 5, to: 5 } });
    });
    await settle();
    setValue("p = \\frac{L}{N}");
    expect(document.querySelector(".gotipe-math-preview mfrac")).not.toBeNull();
    press("Enter");
    expect(spans(editor)[1]).toMatchObject({
      text: "p = \\frac{L}{N}",
      marks: [{ type: "inlineMath" }],
    });
    expect(document.querySelector(".gotipe-math-pop")).toBeNull();
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("Доля ");
  });

  it("edits a formula on click, names the error, cancels with Escape and confirms in one step", async () => {
    const editor = await open("Доля ");
    caretAt(editor, 5);
    act(() => {
      requestAtomUI(editor, { type: "math", insert: { blockId: "p", from: 5, to: 5 } });
    });
    await settle();
    setValue("x^2");
    press("Enter");
    await settle();
    const formula = () =>
      document.querySelector<HTMLElement>('[data-gotipe-atom][data-type="inlineMath"]')!;
    act(() => formula().click());
    await settle();
    expect(field().value).toBe("x^2");
    expect(document.querySelector(".gotipe-atom-selected .gotipe-math-inline")).not.toBeNull();
    setValue("\\frac{a");
    expect(document.querySelector(".gotipe-math-field")!.classList.contains("is-invalid")).toBe(
      true,
    );
    expect(document.querySelector(".gotipe-math-reason")!.textContent).toBe(
      "Не хватает закрывающей «}»",
    );
    press("Escape");
    expect(spans(editor)[1]!.text).toBe("x^2");
    act(() => formula().click());
    await settle();
    setValue("x^3");
    press("Enter");
    expect(spans(editor)[1]!.text).toBe("x^3");
    expect(editor.undo()).toBe(true);
    expect(spans(editor)[1]!.text).toBe("x^2");
  });

  it("leaves money as text and undoes a typed formula on Escape", async () => {
    const money = await open("costs $5-");
    caretAt(money, 9);
    type(money, "$");
    await settle();
    expect(spans(money)).toEqual([{ text: "costs $5-$", marks: [] }]);
    expect(document.querySelector(".gotipe-math-pop")).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    const editor = await open("Цена $x^2");
    caretAt(editor, 9);
    type(editor, "$");
    await settle();
    expect(spans(editor)[1]!.marks[0]!.type).toBe("inlineMath");
    press("Escape");
    await settle();
    expect(spans(editor)).toEqual([{ text: "Цена $x^2$", marks: [] }]);
    expect(document.querySelector(".gotipe-math-pop")).toBeNull();
  });

  it("keeps Tab inside and closes when the focus leaves", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    const editor = await open("Доля ");
    caretAt(editor, 5);
    act(() => {
      requestAtomUI(editor, { type: "math", insert: { blockId: "p", from: 5, to: 5 } });
    });
    await settle();
    setValue("x");
    const confirm = document.querySelector<HTMLButtonElement>(".gotipe-math-confirm")!;
    act(() => confirm.focus());
    act(() => {
      confirm.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      );
    });
    expect(document.activeElement).toBe(field());
    act(() => outside.focus());
    expect(document.querySelector(".gotipe-math-pop")).toBeNull();
    outside.remove();
  });

  it("turns typed $…$ into a formula and opens it", async () => {
    const editor = await open("Цена $x^2");
    caretAt(editor, 9);
    type(editor, "$");
    await settle();
    expect(spans(editor)[1]).toMatchObject({ text: "x^2", marks: [{ type: "inlineMath" }] });
    expect(field().value).toBe("x^2");
  });
});

describe("PageEditor", () => {
  it("reads and writes mentions when the host gives people", async () => {
    let page: GoTipeEditor | null = null;
    const changes: string[] = [];
    await act(async () => {
      root.render(
        <PageEditor
          markdown={"# План\n\nСмотрит [@Анна Ковалёва](mention:user-u3)\n"}
          mentions={mentions}
          autoFocus={false}
          onReady={(editor) => {
            page = editor;
          }}
          onChange={(markdown) => changes.push(markdown)}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(container.querySelector('.gotipe-mention[data-kind="person"]')).not.toBeNull();
    const editor = page as unknown as GoTipeEditor;
    const block = editor.getViewState().blocks[1]!;
    act(() => {
      editor.dispatch({
        steps: [{ type: "insertText", blockId: block.id, offset: 0, text: "Он " }],
      });
    });
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 400)));
    expect(changes.at(-1)).toContain("[@Анна Ковалёва](mention:user-u3)");
  });
});
