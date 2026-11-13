// @vitest-environment jsdom
import { createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { EditorContent } from "../editor-content";

it.each(["", "plain", "plaintext"])(
  "shows the language %j as Plain text and writes an empty language for it",
  async (language) => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const editor = await createEditor({
      extensions: [FullPreset],
      content: {
        version: 1,
        blocks: [
          { id: "code", type: "codeBlock", attrs: { language }, content: "x", children: [] },
        ],
      },
    });
    const root = createRoot(container);
    act(() => root.render(<EditorContent editor={editor} />));
    const menu = () => container.querySelector<HTMLSelectElement>(".gotipe-code-language-select")!;
    const choose = (value: string) =>
      act(() => {
        menu().value = value;
        menu().dispatchEvent(new Event("change", { bubbles: true }));
      });
    expect(menu().value).toBe("");
    expect(menu().selectedOptions[0]!.textContent).toBe("Plain text");
    expect([...menu().options].map((option) => option.value)).not.toContain("plain");
    choose("typescript");
    expect(editor.getJSON().blocks[0]!.attrs.language).toBe("typescript");
    choose("");
    expect(editor.getJSON().blocks[0]!.attrs.language).toBe("");
    act(() => root.unmount());
    editor.destroy();
    container.remove();
  },
);
