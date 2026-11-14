// @vitest-environment jsdom
import type { Block } from "@gotipe/core";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { DefaultPreset } from "@gotipe/core/presets";
import { GoTipeI18nProvider } from "@gotipe/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlockEditor } from "../components/block-editor";

let container: HTMLDivElement;
let root: Root;
const editors: GoTipeEditor[] = [];
const frame = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  for (const editor of editors.splice(0)) editor.destroy();
});

const cell = (id: string, text: string, attrs: Block["attrs"] = {}, header = false): Block => ({
  id,
  type: header ? "tableHeader" : "tableCell",
  attrs,
  content: text ? [{ text, marks: [] }] : [],
  children: [],
});
const row = (id: string, cells: Block[]): Block => ({
  id,
  type: "tableRow",
  attrs: {},
  content: null,
  children: cells,
});
/** The table of Atlas frame 29. */
const FRAME: Block = {
  id: "t",
  type: "table",
  attrs: {},
  content: null,
  children: [
    row("r0", [
      cell("p", "Платформа", { rowspan: 2 }, true),
      cell("j", "Журнал", { colspan: 2 }, true),
      cell("e", "Шифрование", { rowspan: 2 }, true),
    ]),
    row("r1", [cell("k", "Ключ", {}, true), cell("q", "В очереди", {}, true)]),
    row("r2", [
      cell("w", "Веб"),
      cell("wk", "drafts.web"),
      cell("wq", "1 284"),
      cell("ws", "Ключ сессии", { rowspan: 2 }),
    ]),
    row("r3", [cell("m", "macOS"), cell("mk", "drafts.mac"), cell("mq", "312")]),
    row("r4", [cell("i", "iOS"), cell("ik", "drafts.ios"), cell("iq", "0"), cell("is", "Нет")]),
  ],
};

async function mount() {
  const editor = await createEditor({
    extensions: DefaultPreset,
    content: { version: 1, blocks: [structuredClone(FRAME)] },
  });
  editors.push(editor);
  act(() =>
    root.render(
      <GoTipeI18nProvider locale="ru">
        <BlockEditor editor={editor} showBlockToolbar={false} />
      </GoTipeI18nProvider>,
    ),
  );
  await frame();
  return editor;
}
const cellOf = (id: string) => container.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
const pointer = (type: string, target: Element, init: PointerEventInit = {}) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
  target.dispatchEvent(event);
  return event;
};
function openMenu(handle: HTMLElement) {
  act(() => handle.click());
  return document.querySelector<HTMLElement>("[data-gotipe-column-menu], [data-gotipe-row-menu]")!;
}
const item = (menu: HTMLElement, label: string) =>
  [...menu.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.querySelector(".gotipe-menu-text")?.textContent?.includes(label),
  )!;

describe("merged table cells in BlockEditor", () => {
  it("draws spans, keeps both header rows in the head and marks a continued row", async () => {
    await mount();
    expect(cellOf("j").getAttribute("colspan")).toBe("2");
    expect(cellOf("p").getAttribute("rowspan")).toBe("2");
    expect(cellOf("ws").getAttribute("rowspan")).toBe("2");
    expect(container.querySelectorAll("thead > tr")).toHaveLength(2);
    expect(container.querySelectorAll("col")).toHaveLength(4);
    expect(cellOf("k").closest("tr")!.classList.contains("is-continued")).toBe(true);
    expect(cellOf("w").closest("tr")!.classList.contains("is-continued")).toBe(false);
    // the column handle of the wide header serves both its columns
    expect(cellOf("j").querySelector(".gotipe-column-handle")).not.toBeNull();
    // the first column's width handle sits in the header ending there; the cell under the wide
    // header carries the handle of its own column
    expect(cellOf("k").querySelector(".gotipe-table-col-resize")).not.toBeNull();
    expect(cellOf("q").querySelector(".gotipe-table-col-resize")).toBeNull();
    expect(cellOf("j").querySelector(".gotipe-table-col-resize")).not.toBeNull();
  });

  it("selects cells by dragging, merges them from the row menu in one undo step", async () => {
    const editor = await mount();
    const menu = openMenu(cellOf("w").querySelector<HTMLElement>(".gotipe-row-handle")!);
    const merge = item(menu, "Объединить ячейки");
    expect(merge.getAttribute("aria-disabled")).toBe("true");
    expect(merge.textContent).toContain("Выделите несколько ячеек");
    expect(item(menu, "Разделить ячейку").getAttribute("aria-disabled")).toBe("true");
    act(() => merge.click());
    expect(editor.getJSON().blocks[0]).toEqual(FRAME);
    act(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    // drag from «drafts.mac» to «iOS · 0»: the rectangle covers two rows and two columns
    document.elementFromPoint = () => cellOf("iq");
    act(() => {
      pointer("pointerdown", cellOf("mk"));
      pointer("pointermove", cellOf("iq"), { buttons: 1 });
      pointer("pointerup", cellOf("iq"));
    });
    const selected = [...container.querySelectorAll(".gotipe-table-cell-selected")].map(
      (node) => (node as HTMLElement).dataset.blockId,
    );
    expect(selected).toEqual(["mk", "mq", "ik", "iq"]);
    const again = openMenu(cellOf("w").querySelector<HTMLElement>(".gotipe-row-handle")!);
    const enabled = item(again, "Объединить ячейки");
    expect(enabled.getAttribute("aria-disabled")).toBeNull();
    act(() => enabled.click());
    expect(cellOf("mk").getAttribute("colspan")).toBe("2");
    expect(cellOf("mk").getAttribute("rowspan")).toBe("2");
    expect(cellOf("mk").textContent).toContain("drafts.mac");
    expect(container.querySelectorAll(".gotipe-table-cell-selected")).toHaveLength(0);
    act(() => {
      editor.undo();
    });
    expect(editor.getJSON().blocks[0]).toEqual(FRAME);
  });

  it("splits a merged header from its column menu", async () => {
    const editor = await mount();
    const menu = openMenu(cellOf("j").querySelector<HTMLElement>(".gotipe-column-handle")!);
    // a header over two columns: no single type, its delete takes both columns
    expect(item(menu, "Текст")).toBeUndefined();
    expect(item(menu, "Удалить столбцы")).toBeDefined();
    const split = item(menu, "Разделить ячейку");
    expect(split.getAttribute("aria-disabled")).toBeNull();
    act(() => split.click());
    expect(cellOf("j").hasAttribute("colspan")).toBe(false);
    expect(editor.getJSON().blocks[0]!.children[0]!.children).toHaveLength(4);
  });

  it("extends a selection with Shift+arrows from a cell's edge, clears it with Escape", async () => {
    const editor = await mount();
    editor.setSelection({
      anchor: { blockId: "wq", offset: 5 },
      head: { blockId: "wq", offset: 5 },
    });
    const scroll = container.querySelector(".gotipe-table-scroll")!;
    const key = (value: string, shiftKey = true) =>
      act(() => {
        cellOf("wq").dispatchEvent(
          new KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true }),
        );
      });
    expect(scroll).not.toBeNull();
    key("ArrowRight");
    expect(
      [...container.querySelectorAll(".gotipe-table-cell-selected")].map(
        (node) => (node as HTMLElement).dataset.blockId,
      ),
    ).toEqual(["wq", "ws", "mq"]);
    key("ArrowDown");
    // the rectangle keeps «Ключ сессии» whole and grows past it
    expect(container.querySelectorAll(".gotipe-table-cell-selected")).toHaveLength(5);
    key("Escape", false);
    expect(container.querySelectorAll(".gotipe-table-cell-selected")).toHaveLength(0);
  });

  it("merges and splits from the keyboard and says how many cells are selected", async () => {
    const editor = await mount();
    editor.setSelection({
      anchor: { blockId: "mk", offset: 10 },
      head: { blockId: "mk", offset: 10 },
    });
    const press = (key: string, init: KeyboardEventInit = {}) =>
      act(() => {
        cellOf("mk").dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
        );
      });
    press("ArrowRight", { shiftKey: true });
    const live = container.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toBe("Выделено ячеек: 2");
    // Tab keeps the selection: the keys may be on their way to a menu
    press("Tab");
    expect(container.querySelectorAll(".gotipe-table-cell-selected")).toHaveLength(2);
    press("M", { code: "KeyM", shiftKey: true, ctrlKey: true });
    expect(cellOf("mk").getAttribute("colspan")).toBe("2");
    expect(live.textContent).toBe("");
    editor.setSelection({
      anchor: { blockId: "mk", offset: 0 },
      head: { blockId: "mk", offset: 0 },
    });
    press("M", { code: "KeyM", shiftKey: true, ctrlKey: true });
    expect(cellOf("mk").hasAttribute("colspan")).toBe(false);
    expect(editor.getJSON().blocks[0]!.children[3]!.children).toHaveLength(3);
  });
});
