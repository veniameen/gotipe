// @vitest-environment jsdom
import { Subscript, Superscript } from "@gotipe/core/extensions";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { DefaultPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MoreMenu } from "./more-menu";
import { hasMark } from "./schema";

let container: HTMLDivElement;
let root: Root;
const editors: GoTipeEditor[] = [];
const frame = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 40)));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  for (const editor of editors.splice(0)) editor.destroy();
  container.remove();
});

async function editorWith(extensions: unknown[]) {
  const editor = await createEditor({
    extensions: extensions as Parameters<typeof createEditor>[0]["extensions"],
    content: {
      version: 1,
      blocks: [
        {
          id: "p0",
          type: "paragraph",
          attrs: {},
          content: [{ text: "H2O", marks: [] }],
          children: [],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

/** Opens “More” on a selection and lists its rows. */
async function rows(editor: GoTipeEditor) {
  act(() => root.render(<MoreMenu key={editors.indexOf(editor)} editor={editor} />));
  act(() =>
    editor.setSelection({
      anchor: { blockId: "p0", offset: 1 },
      head: { blockId: "p0", offset: 2 },
    }),
  );
  act(() => container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click());
  await frame();
  return [...container.querySelectorAll('[role="menuitem"]')].map(
    (row) => row.getAttribute("data-mark") ?? row.textContent,
  );
}

describe("“More” offers only the marks the editor has", () => {
  it("leaves out superscript and subscript in DefaultPreset", async () => {
    const editor = await editorWith([DefaultPreset]);
    expect(hasMark(editor, "superscript")).toBe(false);
    expect(hasMark(editor, "bold")).toBe(true);
    expect(await rows(editor)).toEqual(["Clear Formatting", "Copy as Markdown"]);
  });

  it("offers each script mark the editor has, and it marks the selection", async () => {
    const only = await editorWith([DefaultPreset, Superscript]);
    expect(await rows(only)).toEqual(["superscript", "Clear Formatting", "Copy as Markdown"]);

    const editor = await editorWith([DefaultPreset, Superscript, Subscript]);
    expect(await rows(editor)).toEqual([
      "superscript",
      "subscript",
      "Clear Formatting",
      "Copy as Markdown",
    ]);
    act(() => container.querySelector<HTMLButtonElement>('[data-mark="subscript"]')!.click());
    const [, two] = editor.getJSON().blocks[0]!.content as { text: string; marks: unknown[] }[];
    expect(two).toEqual({ text: "2", marks: [{ type: "subscript", attrs: {} }] });
  });
});
