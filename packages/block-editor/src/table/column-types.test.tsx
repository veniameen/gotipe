// @vitest-environment jsdom
import type { Block, BlockView } from "@gotipe/core";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { DefaultPreset } from "@gotipe/core/presets";
import { GoTipeI18nProvider } from "@gotipe/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlockEditor } from "../components/block-editor";
import { columnTypeOf, findTable, setColumnType } from "./column-types";

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

const cell = (id: string, text: string, header = false): Block => ({
  id,
  type: header ? "tableHeader" : "tableCell",
  attrs: {},
  content: text ? [{ text, marks: [] }] : [],
  children: [],
});
/** A task column and a done column with these values under the header «Готово». */
const table = (...done: string[]): Block => ({
  id: "t",
  type: "table",
  attrs: {},
  content: null,
  children: [
    {
      id: "r0",
      type: "tableRow",
      attrs: {},
      content: null,
      children: [cell("h0", "Задача", true), cell("h1", "Готово", true)],
    },
    ...done.map((value, index) => ({
      id: `r${index + 1}`,
      type: "tableRow",
      attrs: {},
      content: null,
      children: [cell(`a${index}`, `task ${index}`), cell(`d${index}`, value)],
    })),
  ],
});

async function editorWith(...done: string[]) {
  const editor = await createEditor({
    extensions: DefaultPreset,
    content: { version: 1, blocks: [table(...done)] },
  });
  editors.push(editor);
  return editor;
}
const values = (editor: GoTipeEditor) =>
  findTable(editor, "t")!
    .children.slice(1)
    .map((row) => {
      const done = row.children[1] as BlockView;
      return (done.content as { text: string }[]).map((span) => span.text).join("");
    });
const typeOf = (editor: GoTipeEditor, yes?: string, no?: string) =>
  columnTypeOf(findTable(editor, "t")!, 1, yes, no);

describe("the «Да / нет» column stores ✓ and —", () => {
  it("writes the same marks for a Russian and an English interface, in one undo step", async () => {
    for (const words of [
      { yes: "да", no: "нет" },
      { yes: "yes", no: "no" },
    ]) {
      const editor = await editorWith("yes", "no", "", "true", "0", "x", "maybe");
      const before = editor.getJSON();
      setColumnType(editor, "t", 1, "boolean", words);
      expect(values(editor)).toEqual(["✓", "—", "—", "✓", "—", "✓", "maybe"]);
      editor.undo();
      expect(editor.getJSON()).toEqual(before);
    }
  });

  it("reads the words earlier versions wrote — «да», «yes» and the host's — as ✓ and —", async () => {
    const editor = await editorWith("да", "Нет", "Yes", "NO", "ja", "nein");
    expect(typeOf(editor)).toBe("text");
    expect(typeOf(editor, "ja", "nein")).toBe("boolean");
    setColumnType(editor, "t", 1, "boolean");
    // Without the host's words, its «ja» and «nein» are other values and stay.
    expect(values(editor)).toEqual(["✓", "—", "✓", "—", "ja", "nein"]);
    setColumnType(editor, "t", 1, "boolean", { yes: "ja", no: "nein" });
    expect(values(editor)).toEqual(["✓", "—", "✓", "—", "✓", "—"]);
    expect(typeOf(editor)).toBe("boolean");
  });

  it("takes the host's words before the built-in ones: its «no» may be «x»", async () => {
    const editor = await editorWith("x", "ja");
    expect(typeOf(editor, "ja", "x")).toBe("boolean");
    setColumnType(editor, "t", 1, "boolean", { yes: "ja", no: "x" });
    expect(values(editor)).toEqual(["—", "✓"]);
    // Values that are not the host's words still follow the built-in ones.
    const other = await editorWith("x", "1", "-");
    setColumnType(other, "t", 1, "boolean", { yes: "ja", no: "x" });
    expect(values(other)).toEqual(["—", "✓", "—"]);
  });

  it("knows a column of ✓ and — whatever words the interface has", async () => {
    const editor = await editorWith("✓", "—", " ✓ ", "");
    expect(typeOf(editor)).toBe("boolean");
    expect(typeOf(editor, "да", "нет")).toBe("boolean");
    expect(typeOf(await editorWith("✓", "draft"))).toBe("text");
  });
});

describe("the column menu in BlockEditor", () => {
  for (const locale of ["ru", "en"])
    it(`switches a column to ✓ and — in the ${locale} interface and shows it checked`, async () => {
      const editor = await editorWith("да", "", "yes");
      act(() =>
        root.render(
          <GoTipeI18nProvider locale={locale}>
            <BlockEditor editor={editor} showBlockToolbar={false} />
          </GoTipeI18nProvider>,
        ),
      );
      await frame();
      const open = () => {
        const header = container.querySelector('[data-block-id="h1"]')!;
        act(() => header.querySelector<HTMLElement>(".gotipe-column-handle")!.click());
        return [
          ...document.querySelectorAll<HTMLButtonElement>("[data-gotipe-column-menu] button"),
        ];
      };
      const label = locale === "ru" ? "Да / нет" : "Yes / no";
      const row = () => open().find((button) => button.textContent?.includes(label))!;
      const boolean = row();
      act(() => boolean.click());
      expect(values(editor)).toEqual(["✓", "—", "✓"]);
      await frame();
      expect(row().getAttribute("aria-checked")).toBe("true");
    });
});
