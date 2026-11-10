// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act, useState } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EditorContent } from "../editor-content";
import { CodeBlock } from "./code-block";
import type { BlockViewProps } from "./context";

let editor: GoTipeEditor;
let container: HTMLDivElement;
let root: Root;
let highlight: (value: boolean) => void;
function View(props: BlockViewProps) {
  const [tokens, setTokens] = useState(false);
  highlight = setTokens;
  const text = String(props.block.content);
  return (
    <CodeBlock {...props}>
      {tokens ? [...text].map((char, index) => <span key={index}>{char}</span>) : undefined}
    </CodeBlock>
  );
}
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  editor = await createEditor({
    extensions: [FullPreset],
    content: {
      version: 1,
      blocks: [
        {
          id: "code",
          type: "codeBlock",
          attrs: { language: "js" },
          content: "const 😀 = 42;",
          children: [],
        },
        {
          id: "after",
          type: "paragraph",
          attrs: {},
          content: [{ text: "Next paragraph", marks: [] }],
          children: [],
        },
      ],
    },
  });
  act(() => root.render(<EditorContent editor={editor} blockViews={{ codeBlock: View }} />));
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
});
function select(anchor: Node, offset: number, head = anchor, end = offset) {
  editor.element!.focus();
  document.getSelection()!.setBaseAndExtent(anchor, offset, head, end);
}
function selection() {
  editor.syncSelectionFromDOM();
  return editor.getViewState().selection;
}
it("preserves the native UTF-16 caret and reverse cross-block range when tokens replace raw text", () => {
  const code = container.querySelector("code[data-gotipe-text-content]")!;
  const after = container.querySelector('[data-block-id="after"]')!;
  select(code.firstChild!, 8);
  act(() => highlight(true));
  expect(selection()).toMatchObject({
    anchor: { blockId: "code", offset: 8 },
    head: { blockId: "code", offset: 8 },
  });
  select(after.firstChild!, 4, code.querySelectorAll("span")[2]!.firstChild!, 1);
  act(() => highlight(false));
  expect(selection()).toMatchObject({
    anchor: { blockId: "after", offset: 4 },
    head: { blockId: "code", offset: 3 },
  });
  expect(editor.getViewState().toolbar.canUndo).toBe(false);
});
it("defers a token-only render while native composition owns the code", async () => {
  const code = container.querySelector("code[data-gotipe-text-content]")!;
  select(code.firstChild!, 8);
  const textNode = code.firstChild;
  act(() =>
    editor.element!.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })),
  );
  act(() => highlight(true));
  expect(code.firstChild).toBe(textNode);
  expect(code.querySelector("span")).toBeNull();
  await act(async () => {
    editor.element!.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "" }),
    );
    await new Promise(requestAnimationFrame);
  });
  expect(code.querySelector("span")).not.toBeNull();
  expect(code.textContent).toBe("const 😀 = 42;");
});
it("does not steal an independent input's focus when highlighting arrives", () => {
  const control = container.querySelector("select")!;
  control.focus();
  act(() => highlight(true));
  expect(document.activeElement).toBe(control);
});
it("leaves transaction selection restoration with the editor when a new block appears", async () => {
  const code = container.querySelector("code[data-gotipe-text-content]")!;
  select(code.firstChild!, 8);
  editor.syncSelectionFromDOM();
  let target = "";
  await act(async () => {
    editor.chain().insertBlockAfter("paragraph").run();
    target = editor
      .getViewState()
      .blocks.find((block) => block.id !== "code" && block.id !== "after")!.id;
    editor.setSelection({
      anchor: { blockId: target, offset: 0 },
      head: { blockId: target, offset: 0 },
    });
  });
  expect(target).not.toBe("code");
  expect(editor.getDOMSelection()?.anchor.blockId).toBe(target);
});
it("reattaches composition ownership when the editor instance changes", async () => {
  const previous = editor;
  editor = await createEditor({
    extensions: [FullPreset],
    content: {
      version: 1,
      blocks: [
        {
          id: "code",
          type: "codeBlock",
          attrs: { language: "js" },
          content: "Replacement",
          children: [],
        },
      ],
    },
  });
  act(() => {
    previous.destroy();
    root.render(<EditorContent editor={editor} blockViews={{ codeBlock: View }} />);
  });
  const code = container.querySelector("code[data-gotipe-text-content]")!;
  expect(code.textContent).toBe("Replacement");
  select(code.firstChild!, 3);
  act(() =>
    editor.element!.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })),
  );
  act(() => highlight(true));
  expect(code.querySelector("span")).toBeNull();
  await act(async () => {
    editor.element!.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "" }),
    );
    await new Promise(requestAnimationFrame);
  });
  expect(code.querySelector("span")).not.toBeNull();
});

it("keeps deferred tokens out of a new composition that starts before the resume frame", async () => {
  const code = container.querySelector("code[data-gotipe-text-content]")!;
  select(code.firstChild!, 8);
  const textNode = code.firstChild;
  act(() =>
    editor.element!.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })),
  );
  act(() => highlight(true));
  await act(async () => {
    editor.element!.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "" }),
    );
    editor.element!.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    await new Promise(requestAnimationFrame);
  });
  expect(code.firstChild).toBe(textNode);
  expect(code.querySelector("span")).toBeNull();
  await act(async () => {
    editor.element!.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "" }),
    );
    await new Promise(requestAnimationFrame);
  });
  expect(code.querySelector("span")).not.toBeNull();
  expect(editor.getText()).toBe("const 😀 = 42;\nNext paragraph");
  expect(editor.getViewState().toolbar.canUndo).toBe(false);
});

it("releases deferred tokens after a recoverable composition interruption", async () => {
  const code = container.querySelector("code[data-gotipe-text-content]")!;
  const errors: { code: string; details?: Record<string, unknown> }[] = [];
  const unsubscribe = editor.on("error", (error) => errors.push(error));
  select(code.firstChild!, 8);
  act(() =>
    editor.element!.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })),
  );
  editor.element!.dispatchEvent(
    new CompositionEvent("compositionupdate", { bubbles: true, data: "Ж😀" }),
  );
  code.textContent = "const 😀Ж😀 = 42;";
  act(() => highlight(true));
  expect(code.querySelector("span")).toBeNull();
  await act(async () => {
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "after", offset: 0, text: "REMOTE" }],
    });
    await new Promise(requestAnimationFrame);
  });
  expect(code.querySelector("span")).not.toBeNull();
  expect(code.textContent).toBe("const 😀 = 42;");
  expect(editor.getText()).toBe("const 😀 = 42;\nREMOTENext paragraph");
  expect(errors[0]).toMatchObject({ code: "COMPOSITION_CONFLICT", details: { text: "Ж😀" } });
  unsubscribe();
});
