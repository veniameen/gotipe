import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { createEditorWithLoader } from "../src/editor";
import type { Block, Document, TextSpan } from "../src/types/block";
import type { CreateEditorOptions, GoTipeEditor } from "../src/types/editor";

export type Engine = "js" | "wasm";
export const ENGINES: Engine[] = ["js", "wasm"];

let initialized = false;
/** Creates an editor on one engine; the WASM module is loaded once per test file. */
export function createOn(engine: Engine, options: CreateEditorOptions): Promise<GoTipeEditor> {
  if (engine === "wasm" && !initialized) {
    wasm.initSync({
      module: readFileSync(resolve(process.cwd(), "../wasm/pkg/gotipe_wasm_bg.wasm")),
    });
    initialized = true;
  }
  return createEditorWithLoader(
    { ...options, engine },
    engine === "wasm" ? async () => wasm : null,
  );
}

export const text = (value: string): TextSpan[] => (value ? [{ text: value, marks: [] }] : []);
export const block = (
  id: string,
  type: string,
  content: Block["content"],
  attrs: Block["attrs"] = {},
  children: Block[] = [],
): Block => ({ id, type, attrs, content, children });
export const paragraph = (id: string, value: string | TextSpan[], attrs: Block["attrs"] = {}) =>
  block(id, "paragraph", typeof value === "string" ? text(value) : value, attrs);
export const doc = (...blocks: Block[]): Document => ({ version: 1, blocks });

/** Mounts the editor on a plain copy of its blocks and types through `beforeinput`. */
export function mountForTyping(editor: GoTipeEditor) {
  const element = document.createElement("div");
  for (const { id, type, content } of editor.getViewState().blocks) {
    const node = document.createElement("div");
    node.dataset.blockId = id;
    node.dataset.blockType = type;
    node.append(
      Array.isArray(content) ? content.map((span) => span.text).join("") : (content ?? ""),
    );
    element.append(node);
  }
  document.body.append(element);
  editor.mount(element);
  return {
    element,
    caret(blockId: string, offset: number) {
      editor.setSelection({ anchor: { blockId, offset }, head: { blockId, offset } });
    },
    type(data: string) {
      for (const char of Array.from(data)) {
        const event = new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: char,
        });
        element.dispatchEvent(event);
      }
    },
    key(key: string, options: KeyboardEventInit = {}) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
      });
      element.dispatchEvent(event);
      return event;
    },
    remove() {
      editor.destroy();
      element.remove();
    },
  };
}
