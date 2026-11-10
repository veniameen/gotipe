import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as wasm from "../../wasm/pkg/gotipe_wasm.js";
import { type GoTipeEditor, createEditorWithLoader } from "../src/editor";
import type { GoTipeError } from "../src/error";
import type { Document } from "../src/types/block";

beforeAll(() =>
  wasm.initSync({
    module: readFileSync(resolve(process.cwd(), "../wasm/pkg/gotipe_wasm_bg.wasm")),
  }),
);
const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});
const paragraph = (id: string, text: string) => ({
  id,
  type: "paragraph",
  attrs: {},
  content: [{ text, marks: [] }],
  children: [],
});
const initial: Document = {
  version: 1,
  blocks: [paragraph("a", "Before"), paragraph("b", "After"), paragraph("tail", "Tail")],
};
async function fixture(engine: "js" | "wasm", crossBlock = false) {
  const editor = await createEditorWithLoader(
    { engine, extensions: [], content: initial },
    async () => wasm,
  );
  editors.push(editor);
  const root = document.createElement("div");
  document.body.append(root);
  const errors: GoTipeError[] = [];
  const render = () => {
    root.replaceChildren(
      ...editor.getJSON().blocks.map((block) => {
        const node = document.createElement("p");
        node.dataset.blockId = block.id;
        node.dataset.blockType = block.type;
        node.textContent =
          typeof block.content === "string"
            ? block.content
            : (block.content ?? []).map((span) => span.text).join("");
        return node;
      }),
    );
  };
  render();
  editor.mount(root);
  editor.on("error", (error) => errors.push(error));
  editor.on("update", render);
  const selection = {
    anchor: { blockId: "a", offset: 2 },
    head: { blockId: crossBlock ? "b" : "a", offset: 2 },
  };
  const start = () => {
    editor.setSelection(selection);
    editor.focus();
    root.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    root.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "Ж😀" }));
    root.firstChild!.textContent = crossBlock ? "BeЖ😀ter" : "BeЖ😀fore";
    if (crossBlock) root.children[1]!.remove();
  };
  const late = (text = "Ж😀") => {
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text,
    });
    root.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    root.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text }));
  };
  return { editor, root, errors, selection, start, late };
}

describe.each(["js", "wasm"] as const)("%s composition interruption boundary", (engine) => {
  it.each([false, true])(
    "preserves external content and recovers input (cross-block %s)",
    async (crossBlock) => {
      const f = await fixture(engine, crossBlock);
      const originalNodes = [...f.root.childNodes];
      f.start();
      let restoredBeforeRenderer = false;
      const remove = f.editor.on("transaction", () => {
        restoredBeforeRenderer =
          originalNodes.every((node, index) => f.root.childNodes[index] === node) &&
          f.root.textContent === "BeforeAfterTail";
      });
      f.editor.dispatch({
        steps: [{ type: "insertText", blockId: "a", offset: 0, text: "REMOTE", marks: [] }],
      });
      remove();
      expect(restoredBeforeRenderer).toBe(true);
      const current = f.editor.getJSON();
      expect(f.editor.getText()).toBe("REMOTEBefore\nAfter\nTail");
      expect(f.errors).toHaveLength(1);
      expect(f.errors[0]).toMatchObject({
        code: "COMPOSITION_CONFLICT",
        details: { text: "Ж😀", selection: f.selection, reason: "dispatch" },
      });
      f.late();
      expect(f.editor.getJSON()).toEqual(current);
      expect(f.root.textContent).toBe("REMOTEBeforeAfterTail");
      expect(f.editor.undo()).toBe(true);
      expect(f.editor.getJSON()).toEqual(initial);
      expect(f.editor.undo()).toBe(false);
    },
  );

  it.each([false, true])(
    "keeps current structure after late noncancelable native input (cross-block %s)",
    async (crossBlock) => {
      const f = await fixture(engine, crossBlock);
      f.start();
      f.editor.dispatch({ steps: [{ type: "deleteBlock", blockId: "a" }] });
      const current = f.editor.getJSON();
      const nodes = [...f.root.childNodes];
      f.root.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          inputType: "insertCompositionText",
          data: "Ж😀!",
        }),
      );
      f.root.firstChild!.textContent = "native leak";
      f.root.lastChild!.remove();
      f.root.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertCompositionText",
          data: "Ж😀!",
        }),
      );
      expect([...f.root.childNodes]).toEqual(nodes);
      expect(f.root.textContent).toBe("AfterTail");
      f.late("Ж😀!");
      expect(f.editor.getJSON()).toEqual(current);
      expect(f.errors.at(-1)?.details?.text).toBe("Ж😀!");
    },
  );

  it.each(["setContent", "undo", "redo"] as const)(
    "interrupts before %s writes and keeps late input out of history",
    async (operation) => {
      const f = await fixture(engine, true);
      if (operation === "undo" || operation === "redo") {
        f.editor.dispatch({
          steps: [{ type: "insertText", blockId: "tail", offset: 4, text: "!", marks: [] }],
        });
        if (operation === "redo") f.editor.undo();
      }
      f.start();
      if (operation === "setContent")
        f.editor.setContent({ version: 1, blocks: [paragraph("replacement", "Current")] });
      else expect(f.editor[operation]()).toBe(true);
      const current = f.editor.getJSON();
      f.late();
      expect(f.editor.getJSON()).toEqual(current);
      expect(f.errors[0]?.details).toMatchObject({ reason: operation, text: "Ж😀" });
    },
  );

  it("defers the latest awareness layer through IME and discards pending work on destroy", async () => {
    const f = await fixture(engine);
    f.start();
    f.editor.setDecorations("awareness", [{ type: "placeholder", blockId: "tail", text: "old" }]);
    const latest = [{ type: "placeholder" as const, blockId: "tail", text: "latest" }];
    f.editor.setDecorations("awareness", latest);
    expect(f.editor.getDecorations("awareness")).toEqual([]);
    expect(f.root.firstChild!.textContent).toBe("BeЖ😀fore");
    f.root.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "Ж😀" }));
    expect(f.editor.getDecorations("awareness")).toEqual(latest);
    expect(f.editor.getText()).toBe("BeЖ😀fore\nAfter\nTail");
    expect(f.errors).toEqual([]);
    f.start();
    let changes = 0;
    f.editor.on("decorationsChange", () => {
      changes++;
    });
    f.editor.setDecorations("awareness", []);
    f.editor.destroy();
    f.root.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "Ж😀" }));
    expect(changes).toBe(0);
    expect(f.errors).toEqual([]);
  });

  it("does not interrupt rejected/no-op operations or report after destroy", async () => {
    const f = await fixture(engine);
    f.start();
    expect(f.editor.dispatch({ steps: [] })).toBe(true);
    expect(f.editor.undo()).toBe(false);
    expect(() =>
      f.editor.dispatch({
        steps: [{ type: "insertText", blockId: "missing", offset: 0, text: "bad" }],
      }),
    ).toThrow();
    const remove = f.editor.addTransactionFilter(() => false);
    expect(
      f.editor.dispatch({
        steps: [{ type: "insertText", blockId: "a", offset: 0, text: "blocked" }],
      }),
    ).toBe(false);
    remove();
    expect(f.errors).toHaveLength(0);
    f.editor.destroy();
    f.root.dispatchEvent(new CompositionEvent("compositionend", { data: "Ж😀" }));
    expect(f.errors).toHaveLength(0);
  });

  it("releases suppression for a new keyboard input and next native composition", async () => {
    const f = await fixture(engine);
    f.start();
    f.editor.dispatch({
      steps: [{ type: "insertText", blockId: "tail", offset: 0, text: "new " }],
    });
    f.late();
    f.root.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "x" }));
    f.root.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: "x",
      }),
    );
    expect(f.editor.getText()).toContain("Bexfore");
    f.start();
    f.root.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "Ж😀" }));
    expect(f.editor.getText()).toContain("BeЖ😀fore");
    expect(f.errors).toHaveLength(1);
  });
});

it("restores renderer ownership before a real CRDT update and preserves the peer edit", async () => {
  const f = await fixture("wasm", true);
  const peer = await createEditorWithLoader(
    { engine: "wasm", extensions: [], content: initial },
    async () => wasm,
  );
  editors.push(peer);
  f.editor.enableCollaboration("composition-local");
  peer.enableCollaboration("composition-peer");
  peer.receiveCollaborationUpdate(f.editor.getCollaborationUpdate());
  f.editor.receiveCollaborationUpdate(peer.getCollaborationUpdate());
  f.start();
  peer.dispatch({ steps: [{ type: "insertText", blockId: "a", offset: 0, text: "REMOTE" }] });
  f.editor.receiveCollaborationUpdate(peer.getCollaborationUpdate());
  const current = f.editor.getJSON();
  expect(f.editor.getText()).toBe("REMOTEBefore\nAfter\nTail");
  f.late();
  expect(f.editor.getJSON()).toEqual(current);
  expect(f.root.textContent).toBe("REMOTEBeforeAfterTail");
  expect(f.errors[0]?.details).toMatchObject({ reason: "receiveCollaborationUpdate", text: "Ж😀" });
});
