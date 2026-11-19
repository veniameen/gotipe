// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { afterEach, expect, it } from "vitest";
import { defineAi } from "./extension";
import type { AiProvider } from "./types";

let editor: GoTipeEditor | null = null;
let surface: HTMLDivElement | null = null;
afterEach(() => {
  if (editor && !editor.isDestroyed) editor.destroy();
  surface?.remove();
  editor = null;
  surface = null;
});

const provider: AiProvider = {
  name: "test",
  async *generateCompletion() {
    yield " more";
  },
  async generateSuggestions() {
    return [];
  },
  async executeCommand() {
    return "";
  },
};

const tab = () => new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });

it("Tab in a widget inside the text does not accept the ghost text; Tab in the text does", async () => {
  surface = document.createElement("div");
  surface.tabIndex = 0;
  document.body.append(surface);
  editor = await createEditor({
    engine: "js",
    extensions: [
      FullPreset,
      defineAi.configure({ provider, enableAutoComplete: true, debounceMs: 0 }),
    ],
    content: {
      version: 1,
      blocks: [
        {
          id: "a",
          type: "paragraph",
          attrs: {},
          content: [{ text: "text", marks: [] }],
          children: [],
        },
      ],
    },
  });
  editor.mount(surface);
  surface.focus();
  const ghost = new Promise<void>((resolve) => {
    editor?.on("aiGhostTextChange", (value) => {
      if (value) resolve();
    });
  });
  editor.setSelection({ anchor: { blockId: "a", offset: 4 }, head: { blockId: "a", offset: 4 } });
  await ghost;
  // a host's field in the text: its Tab moves the focus on, the text does not change
  const slot = document.createElement("div");
  slot.setAttribute("data-gotipe-widget", "");
  const field = slot.appendChild(document.createElement("input"));
  surface.append(slot);
  const hosts = tab();
  field.dispatchEvent(hosts);
  expect(hosts.defaultPrevented).toBe(false);
  expect(editor.getText()).toBe("text");
  slot.remove();
  // the same key in the text accepts it
  const own = tab();
  surface.dispatchEvent(own);
  expect(own.defaultPrevented).toBe(true);
  expect(editor.getText()).toBe("text more");
});
