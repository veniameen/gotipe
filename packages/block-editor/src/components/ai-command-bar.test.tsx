// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AiCommandBar } from "./ai-command-bar";

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
  editor = await createEditor({ extensions: [FullPreset], content: "Hello" });
  editor.mount(surface);
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
  surface.remove();
});
function open() {
  surface.dispatchEvent(
    new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true, cancelable: true }),
  );
}
function enter(value: string) {
  const input = container.querySelector("input")!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
it("opens only for its editor and respects runtime read-only mode", () => {
  act(() => root.render(<AiCommandBar editor={editor} />));
  act(() =>
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true }),
    ),
  );
  expect(container.querySelector("dialog")).toBeNull();
  act(open);
  expect(container.querySelector("dialog")).not.toBeNull();
  act(() => editor.setEditable(false));
  expect(container.querySelector("dialog")).toBeNull();
  act(open);
  expect(container.querySelector("dialog")).toBeNull();
});
it("prevents repeated submission and retains errors and prompt for retry", async () => {
  let reject!: (error: Error) => void;
  const submit = vi.fn(
    () =>
      new Promise<void>((_, no) => {
        reject = no;
      }),
  );
  act(() => root.render(<AiCommandBar editor={editor} onSubmit={submit} />));
  act(open);
  act(() => enter("Improve this"));
  const button = container.querySelector("[aria-label='Submit AI command']")!;
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(submit).toHaveBeenCalledOnce();
  await act(async () => {
    reject(new Error("Provider unavailable"));
  });
  expect(container.querySelector("[role=alert]")?.textContent).toBe("Provider unavailable");
  expect(container.querySelector("input")?.value).toBe("Improve this");
  expect((button as HTMLButtonElement).disabled).toBe(false);
});
it("opens from Ask AI and reports when no command handler is installed", async () => {
  act(() => root.render(<AiCommandBar editor={editor} />));
  act(() => editor.emit("executeAiCommand", { commandId: "askAi" }));
  act(() => enter("Create text"));
  await act(async () =>
    container
      .querySelector("[aria-label='Submit AI command']")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  expect(container.querySelector("[role=alert]")?.textContent).toContain("not available");
});
