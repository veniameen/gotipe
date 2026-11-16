// @vitest-environment jsdom
import { type GoTipeEditor, createEditor, defineExtension } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { GoTipeI18nProvider } from "@gotipe/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiCommandBar } from "./ai-command-bar";
import { AiStatusIndicator } from "./ai-status-indicator";
import { BlockEditor } from "./block-editor";
import { GhostText } from "./ghost-text";

/** Stand-ins under the names of `@gotipe/ai`: the controls look for the extensions by name. */
const ai = defineExtension({ name: "ai" });
const aiContext = defineExtension({ name: "ai-context", dependencies: ["ai"] });
const aiAgent = defineExtension({ name: "ai-agent", dependencies: ["ai", "ai-context"] });

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
    extensions: [FullPreset, ai, aiContext, aiAgent],
    content: "Hello",
  });
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
it("opens from Ask AI and reports when the agent does not answer", async () => {
  const sent = vi.fn();
  editor.on("executeAiCommand", sent);
  act(() => root.render(<AiCommandBar editor={editor} />));
  act(() => editor.emit("executeAiCommand", { commandId: "askAi" }));
  act(() => enter("Create text"));
  await act(async () =>
    container
      .querySelector("[aria-label='Submit AI command']")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  expect(container.querySelector("[role=alert]")?.textContent).toContain("not available");
  expect(sent).toHaveBeenLastCalledWith({ commandId: "freeText", prompt: "Create text" });
});

describe("AI controls exist only with an extension that answers them", () => {
  const others: GoTipeEditor[] = [];
  afterEach(() => {
    for (const other of others.splice(0)) other.destroy();
  });
  async function editorWith(extensions: Parameters<typeof createEditor>[0]["extensions"]) {
    const other = await createEditor({ extensions, content: "Hello" });
    others.push(other);
    other.mount(surface);
    return other;
  }
  const keyJ = (target: Element) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true, cancelable: true }),
    );

  it("has no bar, no ⌘J and no unavailable line without defineAi", async () => {
    const plain = await editorWith([FullPreset]);
    const submit = vi.fn();
    act(() => root.render(<AiCommandBar editor={plain} onSubmit={submit} />));
    let event!: KeyboardEvent;
    act(() => {
      event = new KeyboardEvent("keydown", {
        key: "j",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      surface.dispatchEvent(event);
    });
    // The key stays the browser's: nothing takes it.
    expect(event.defaultPrevented).toBe(false);
    act(() => plain.emit("executeAiCommand", { commandId: "askAi" }));
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("needs, besides defineAi, the agent, the context or the host's own prompt handler", async () => {
    const manager = await editorWith([FullPreset, ai]);
    act(() => root.render(<AiCommandBar editor={manager} />));
    act(() => keyJ(surface));
    expect(container.querySelector("dialog")).toBeNull();
    act(() => root.render(<AiCommandBar editor={manager} onSubmit={vi.fn()} />));
    act(() => keyJ(surface));
    expect(container.querySelector("dialog")).not.toBeNull();
    // The host's handler goes away: so does the bar.
    act(() => root.render(<AiCommandBar editor={manager} />));
    expect(container.querySelector("dialog")).toBeNull();
  });

  it("sends Ask AI's prompt to defineAiContext when there is no agent", async () => {
    const context = await editorWith([FullPreset, ai, aiContext]);
    const sent = vi.fn();
    context.on("executeAiCommand", sent);
    act(() => root.render(<AiCommandBar editor={context} />));
    act(() => context.emit("executeAiCommand", { commandId: "askAi" }));
    expect(container.querySelector("dialog")).not.toBeNull();
    act(() => enter("A paragraph about tides"));
    await act(async () =>
      container
        .querySelector("[aria-label='Submit AI command']")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(sent).toHaveBeenLastCalledWith({
      commandId: "askAi",
      prompt: "A paragraph about tides",
    });
  });

  it("draws ghost text and the AI status only for an editor with defineAi", async () => {
    const plain = await editorWith([FullPreset]);
    const blockId = plain.getViewState().blocks[0]!.id;
    const draw = (target: GoTipeEditor) => {
      act(() =>
        root.render(
          <>
            <GhostText editor={target} />
            <AiStatusIndicator editor={target} />
          </>,
        ),
      );
      act(() => {
        target.emit("aiGhostTextChange", { text: " world", blockId, offset: 5 });
        target.emit("aiStatusChange", { active: true, label: "Writing..." });
      });
    };
    draw(plain);
    expect(document.querySelector("[data-gotipe-ghost-text]")).toBeNull();
    expect(container.querySelector("[data-gotipe-ai-status]")).toBeNull();
    const manager = await editorWith([FullPreset, ai]);
    draw(manager);
    expect(container.querySelector("[data-gotipe-ai-status]")?.textContent).toBe("Writing...");
  });

  it("leaves BlockEditor without AI controls when the editor has no AI extension", async () => {
    const plain = await editorWith([FullPreset]);
    plain.unmount();
    act(() => root.render(<BlockEditor editor={plain} showBlockToolbar={false} />));
    const surfaceOf = container.querySelector("[data-gotipe-content]")!;
    act(() => {
      keyJ(surfaceOf);
      plain.emit("aiStatusChange", { active: true, label: "Writing..." });
    });
    expect(container.querySelector("[data-gotipe-ai-command-bar]")).toBeNull();
    expect(container.querySelector("[data-gotipe-ai-status]")).toBeNull();

    const full = await editorWith([FullPreset, ai, aiContext, aiAgent]);
    full.unmount();
    act(() => root.render(<BlockEditor editor={full} showBlockToolbar={false} />));
    act(() => keyJ(container.querySelector("[data-gotipe-content]")!));
    expect(container.querySelector("[data-gotipe-ai-command-bar]")).not.toBeNull();
  });
});

describe("the AI status speaks the interface's language (D-196)", () => {
  const line = () => container.querySelector("[data-gotipe-ai-status]");
  /** What `@gotipe/ai` sends, and a status of the host's own. */
  function show(locale: string, status: { active: boolean; task?: string; label?: string }) {
    act(() =>
      root.render(
        <GoTipeI18nProvider locale={locale}>
          <AiStatusIndicator editor={editor} />
        </GoTipeI18nProvider>,
      ),
    );
    act(() => editor.emit("aiStatusChange", status));
    return [line()?.textContent, line()?.getAttribute("aria-label")];
  }

  it.each([
    ["ru", "proofread", "Proofreading...", "Модель проверяет правописание…"],
    ["ru", "review", "Reviewing...", "Модель пишет замечания…"],
    ["ru", "rewrite", "Improving...", "Модель улучшает текст…"],
    ["ru", "command", "Processing...", "Модель пишет…"],
    ["en", "suggestions", "Generating suggestions...", "Generating suggestions..."],
    ["en", "paragraph", "Generating paragraph...", "Generating paragraph..."],
  ])("in %s says the task %s by its key, not by label", (locale, task, label, words) => {
    expect(show(locale, { active: true, task, label })).toEqual([words, words]);
  });

  it("shows a host's own status as it is, and a status without words generically", () => {
    expect(show("ru", { active: true, label: "Свой статус" })).toEqual([
      "Свой статус",
      "Свой статус",
    ]);
    expect(show("ru", { active: true, task: "translate", label: "Translating..." })[0]).toBe(
      "Translating...",
    );
    expect(show("ru", { active: true })[0]).toBe("Модель пишет…");
    expect(show("en", { active: true })[0]).toBe("Processing...");
    expect(show("ru", { active: false, task: "proofread" })[0]).toBeUndefined();
  });
});
