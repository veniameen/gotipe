import type { AiCommand } from "@gotipe/ai";
// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AiCommandPalette } from "./command-palette";
import { GhostText } from "./ghost-text";

let editor: GoTipeEditor;
let container: HTMLDivElement;
let surface: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  surface = document.createElement("div");
  document.body.append(container, surface);
  root = createRoot(container);
  editor = await createEditor({
    extensions: [FullPreset],
    content: {
      version: 1,
      blocks: [
        {
          id: "a",
          type: "paragraph",
          attrs: {},
          content: [{ text: "Ж😀 text", marks: [] }],
          children: [],
        },
      ],
    },
  });
  editor.mount(surface);
  editor.setSelection({ anchor: { blockId: "a", offset: 3 }, head: { blockId: "a", offset: 1 } });
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
  surface.remove();
});
function click(element: Element) {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it("passes the real selection, prevents repeated submission and keeps provider errors visible", async () => {
  const response = pending<[]>();
  const execute = vi.fn<AiCommand["execute"]>(() => response.promise);
  const close = vi.fn();
  act(() =>
    root.render(
      <AiCommandPalette
        editor={editor}
        commands={[{ name: "Improve", description: "Rewrite", execute }]}
        onClose={close}
      />,
    ),
  );
  const button = container.querySelector(".gotipe-ai-command-item")!;
  act(() => {
    click(button);
    click(button);
  });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(execute.mock.calls[0]?.[1]).toMatchObject({ selectedText: "😀" });
  await act(async () => {
    response.reject(new Error("Provider unavailable"));
    await response.promise.catch(() => {});
  });
  expect(container.querySelector("[role=alert]")?.textContent).toBe("Provider unavailable");
  expect(close).not.toHaveBeenCalled();
  expect((button as HTMLButtonElement).disabled).toBe(false);
});
it("applies a chosen result at its original selection and suppresses late completion after unmount", async () => {
  const close = vi.fn();
  const execute = vi.fn(async () => [
    { id: "result", type: "rewrite" as const, content: "fixed", confidence: 1 },
  ]);
  act(() =>
    root.render(
      <AiCommandPalette
        editor={editor}
        commands={[{ name: "Improve", description: "Rewrite", execute }]}
        onClose={close}
      />,
    ),
  );
  await act(async () => {
    click(container.querySelector(".gotipe-ai-command-item")!);
  });
  editor.setSelection({ anchor: { blockId: "a", offset: 8 }, head: { blockId: "a", offset: 8 } });
  act(() =>
    click(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "fixed",
      )!,
    ),
  );
  expect(editor.getText()).toBe("Жfixed text");
  editor.undo();
  expect(editor.getText()).toBe("Ж😀 text");
  expect(close).toHaveBeenCalledOnce();
});
it("aborts command context on unmount and ignores its late resolution", async () => {
  const response = pending<[]>();
  const execute = vi.fn<AiCommand["execute"]>(() => response.promise);
  const close = vi.fn();
  act(() =>
    root.render(
      <AiCommandPalette
        editor={editor}
        commands={[{ name: "Improve", description: "Rewrite", execute }]}
        onClose={close}
      />,
    ),
  );
  act(() => click(container.querySelector(".gotipe-ai-command-item")!));
  const signal = execute.mock.calls[0]?.[1]?.signal;
  act(() => root.render(null));
  expect(signal?.aborted).toBe(true);
  await act(async () => response.resolve([]));
  expect(close).not.toHaveBeenCalled();
});
it("ghost text only consumes unmodified Tab inside its own editable editor", () => {
  const accept = vi.fn();
  const dismiss = vi.fn();
  act(() =>
    root.render(
      <GhostText editor={editor} text="suggestion" onAccept={accept} onDismiss={dismiss} />,
    ),
  );
  const outside = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  document.body.dispatchEvent(outside);
  expect(outside.defaultPrevented).toBe(false);
  const inside = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  surface.dispatchEvent(inside);
  expect(inside.defaultPrevented).toBe(true);
  expect(accept).toHaveBeenCalledOnce();
  editor.setEditable(false);
  surface.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
  );
  expect(accept).toHaveBeenCalledOnce();
});
