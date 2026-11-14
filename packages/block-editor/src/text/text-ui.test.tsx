// @vitest-environment jsdom
import {
  CharacterCount,
  FindReplace,
  FontFamily,
  FontSize,
  InvisibleCharacters,
  TextAlign,
  TextDirection,
  getFontFamily,
  getFontSize,
  getTextAlign,
} from "@gotipe/core/extensions";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { DefaultPreset } from "@gotipe/core/presets";
import { GoTipeI18nProvider } from "@gotipe/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlockEditor } from "../components/block-editor";
import { MoreMenu } from "../components/formatting/more-menu";
import { AlignPicker } from "./align";
import { isRightToLeft } from "./direction";
import { findShortcut } from "./find-keys";
import { FontFamilyPicker, FontSizeStepper } from "./font";
import { InvisiblesToggle } from "./invisibles";
import { OVER_LIMIT_LAYER, overLimitRanges } from "./over-limit";

let container: HTMLDivElement;
let root: Root;
const editors: GoTipeEditor[] = [];
const frame = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 40)));
const EXTENSIONS = [
  DefaultPreset,
  FindReplace,
  CharacterCount,
  TextAlign,
  TextDirection,
  FontFamily,
  FontSize,
  InvisibleCharacters,
];

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

async function editorWith(...texts: string[]) {
  const editor = await createEditor({
    extensions: EXTENSIONS,
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

const press = (target: EventTarget, key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  });
const type = (input: HTMLInputElement, value: string) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const click = (element: Element | null | undefined) =>
  act(() => {
    (element as HTMLElement).click();
  });

describe("find bar (Atlas frame 25)", () => {
  it("opens with Mod+F in the editor, counts, steps and closes back to the text", async () => {
    const editor = await editorWith("журнал и журнал", "Журнал лежит");
    act(() => root.render(<BlockEditor editor={editor} />));
    await frame();
    const content = container.querySelector("[data-gotipe-content]")!;
    // Elsewhere the browser keeps its own search.
    const outside = new KeyboardEvent("keydown", { key: "f", code: "KeyF", metaKey: true });
    document.body.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);
    expect(container.querySelector("[data-gotipe-find]")).toBeNull();

    await press(content, "f", { code: "KeyF", metaKey: true });
    // The field has the keys as soon as the bar is drawn: the next key is the query's.
    expect(document.activeElement).toBe(container.querySelector("[data-gotipe-find] input"));
    await frame();
    const bar = container.querySelector("[data-gotipe-find]")!;
    expect(bar.getAttribute("role")).toBe("search");
    const field = bar.querySelector<HTMLInputElement>("input")!;
    expect(document.activeElement).toBe(field);
    await type(field, "журнал");
    expect(bar.querySelector(".gotipe-find-count")?.textContent).toBe("1 of 3");
    expect(container.querySelectorAll(".gotipe-match").length).toBe(3);
    expect(container.querySelectorAll(".gotipe-match.is-current").length).toBe(1);
    await press(field, "Enter");
    expect(bar.querySelector(".gotipe-find-count")?.textContent).toBe("2 of 3");
    await press(field, "Enter", { shiftKey: true });
    expect(bar.querySelector(".gotipe-find-count")?.textContent).toBe("1 of 3");

    await click(bar.querySelector('[aria-label="Match case"]'));
    expect(bar.querySelector('[aria-label="Match case"]')?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(bar.querySelector(".gotipe-find-count")?.textContent).toBe("1 of 2");

    await press(field, "Escape");
    expect(container.querySelector("[data-gotipe-find]")).toBeNull();
    expect(container.querySelectorAll(".gotipe-match").length).toBe(0);
    const { selection } = editor.getViewState();
    expect(selection.anchor).toEqual({ blockId: "p0", offset: 0 });
    expect(selection.head).toEqual({ blockId: "p0", offset: 6 });
  });

  it("shows the empty search and replaces from Mod+Alt+F", async () => {
    const editor = await editorWith("журнал и журнал");
    act(() => root.render(<BlockEditor editor={editor} />));
    await frame();
    const content = container.querySelector("[data-gotipe-content]")!;
    await press(content, "ƒ", { code: "KeyF", metaKey: true, altKey: true });
    await frame();
    const bar = container.querySelector("[data-gotipe-find]")!;
    const [field, replacement] = Array.from(bar.querySelectorAll<HTMLInputElement>("input"));
    await type(field!, "синхронизация");
    expect(bar.querySelector(".gotipe-find-field")?.className).toContain("is-invalid");
    expect(bar.querySelector(".gotipe-find-count")?.textContent).toBe("0 of 0");
    expect(bar.querySelector<HTMLButtonElement>('[aria-label="Next match"]')?.disabled).toBe(true);

    await type(field!, "журнал");
    await type(replacement!, "очередь");
    await act(async () => {
      Array.from(bar.querySelectorAll("button"))
        .find((button) => button.textContent === "Replace all")
        ?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(editor.getText()).toBe("очередь и очередь");
    editor.undo();
    expect(editor.getText()).toBe("журнал и журнал");
  });

  it("reads the physical key, so any layout opens it", () => {
    const key = { key: "а", code: "KeyF", metaKey: true, ctrlKey: false, altKey: false };
    expect(findShortcut({ ...key, shiftKey: false }, true)).toBe("find");
    expect(findShortcut({ ...key, altKey: true, shiftKey: false }, true)).toBe("replace");
    expect(findShortcut({ ...key, shiftKey: true }, true)).toBeNull();
    expect(findShortcut({ ...key, shiftKey: false }, false)).toBeNull();
  });
});

describe("counter (Atlas frame 26)", () => {
  it("counts words and characters with plural forms, near and over a limit", async () => {
    const editor = await editorWith("Один два три", "четыре");
    act(() =>
      root.render(
        <GoTipeI18nProvider locale="ru">
          <BlockEditor editor={editor} status />
        </GoTipeI18nProvider>,
      ),
    );
    await frame();
    const status = () => container.querySelector(".gotipe-status")!;
    expect(status().textContent).toBe("4 слова · 18 символов");

    act(() =>
      root.render(
        <GoTipeI18nProvider locale="ru">
          <BlockEditor editor={editor} status={{ limit: 19 }} />
        </GoTipeI18nProvider>,
      ),
    );
    await frame();
    expect(status().querySelector(".is-near")?.textContent).toBe("18 из 19 символов");

    act(() =>
      root.render(
        <GoTipeI18nProvider locale="ru">
          <BlockEditor editor={editor} status={{ limit: 10, reason: "Короткое описание" }} />
        </GoTipeI18nProvider>,
      ),
    );
    await frame();
    const over = status().querySelector(".is-over")!;
    // The tone changed: the count and its reason are announced once.
    expect(status().querySelector('[role="status"]')?.textContent).toBe(
      "18 из 10 символов. Короткое описание",
    );
    expect(over.textContent).toBe("18 из 10 символовКороткое описание");
    expect(over.getAttribute("tabindex")).toBe("0");
    expect(editor.getDecorations(OVER_LIMIT_LAYER)).toMatchObject([
      { blockId: "p0", from: 10, to: 12 },
      { blockId: "p1", from: 0, to: 6 },
    ]);
    expect(container.querySelectorAll(".gotipe-over-limit").length).toBe(2);

    act(() => root.render(<BlockEditor editor={editor} />));
    await frame();
    expect(editor.getDecorations(OVER_LIMIT_LAYER)).toEqual([]);
  });

  it("cuts the over-limit range between grapheme clusters", () => {
    const block = (id: string, text: string) => ({
      id,
      type: "paragraph",
      attrs: {},
      content: [{ text, marks: [] }],
      children: [],
    });
    const ranges = overLimitRanges([block("a", "ab👍🏽c")] as never, 3);
    expect(ranges).toMatchObject([{ blockId: "a", from: 6, to: 7 }]);
  });
});

describe("alignment, font, size, invisibles (Atlas frames 27–28)", () => {
  it("aligns from «More» and from the toolbar list", async () => {
    const editor = await editorWith("Офлайн-черновики");
    act(() => root.render(<MoreMenu editor={editor} />));
    await click(container.querySelector('[aria-haspopup="menu"]'));
    await frame();
    const center = container.querySelector<HTMLButtonElement>('[data-align="center"]')!;
    expect(center.getAttribute("aria-keyshortcuts")).toBe("Meta+Shift+E");
    expect(container.querySelector('[data-align="left"]')?.getAttribute("aria-checked")).toBe(
      "true",
    );
    await click(center);
    expect(getTextAlign(editor)).toBe("center");

    act(() => root.render(<AlignPicker editor={editor} />));
    await click(container.querySelector('[aria-haspopup="listbox"]'));
    await frame();
    await click(container.querySelector('[data-align="justify"]'));
    expect(getTextAlign(editor)).toBe("justify");
    editor.undo();
    expect(getTextAlign(editor)).toBe("center");
  });

  it("sets the face and the size of a selection", async () => {
    const editor = await editorWith("Правка без сети");
    editor.setSelection({
      anchor: { blockId: "p0", offset: 0 },
      head: { blockId: "p0", offset: 6 },
    });
    act(() =>
      root.render(
        <>
          <FontFamilyPicker editor={editor} />
          <FontSizeStepper editor={editor} />
        </>,
      ),
    );
    await click(container.querySelector('[aria-haspopup="listbox"]'));
    await frame();
    const serif = container.querySelector('[data-font-family="serif"] > .gotipe-font');
    expect(serif?.getAttribute("data-font")).toBe("serif");
    await click(serif?.parentElement);
    expect(getFontFamily(editor)).toBe("serif");

    editor.setSelection({
      anchor: { blockId: "p0", offset: 0 },
      head: { blockId: "p0", offset: 6 },
    });
    const field = container.querySelector<HTMLInputElement>(".gotipe-size-field")!;
    await act(() => field.focus());
    await type(field, "18");
    await press(field, "Enter");
    expect(getFontSize(editor)).toBe(18);
    await click(container.querySelector('[aria-label="Larger text"]'));
    expect(getFontSize(editor)).toBe(19);
    await type(field, "99");
    await press(field, "Enter");
    expect(getFontSize(editor)).toBe(48);
  });

  it("switches invisible characters", async () => {
    const editor = await editorWith("a b");
    act(() => root.render(<InvisiblesToggle editor={editor} />));
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(editor.getDecorations("invisibles").length).toBeGreaterThan(0);
    await click(button);
    expect(editor.getDecorations("invisibles")).toEqual([]);
  });

  it("gives text blocks their direction", async () => {
    const editor = await editorWith("Правка", "لم تعد التعديلات");
    editor.setSelection({
      anchor: { blockId: "p1", offset: 0 },
      head: { blockId: "p1", offset: 0 },
    });
    act(() => root.render(<BlockEditor editor={editor} />));
    await frame();
    const block = (id: string) => container.querySelector(`[data-block-id="${id}"]`)!;
    expect(block("p0").getAttribute("dir")).toBe("auto");
    editor.dispatch({ steps: [{ type: "setBlockAttrs", blockId: "p1", attrs: { dir: "rtl" } }] });
    await frame();
    expect(block("p1").getAttribute("dir")).toBe("rtl");
    expect(isRightToLeft(block("p1"))).toBe(true);
    expect(isRightToLeft(block("p0"))).toBe(false);
  });
});
