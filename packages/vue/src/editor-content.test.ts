// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { FullPreset } from "@gotipe/core/presets";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type App, type ShallowRef, createApp, h, nextTick, shallowRef } from "vue";
import { EditorContent } from "./editor-content";

const apps: App[] = [];
const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  for (const editor of editors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

async function makeEditor() {
  const editor = await createEditor({
    extensions: [FullPreset],
    engine: "js",
    content: {
      version: 1,
      blocks: [
        {
          id: "p",
          type: "paragraph",
          attrs: {},
          content: [{ text: "Hello", marks: [{ type: "bold", attrs: {} }] }],
          children: [],
        },
        {
          id: "list",
          type: "todoList",
          attrs: {},
          content: null,
          children: [
            {
              id: "task",
              type: "todoItem",
              attrs: { checked: false },
              content: [{ text: "Task", marks: [] }],
              children: [],
            },
          ],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function mount(editor: ShallowRef<GoTipeEditor | null>) {
  const root = document.createElement("div");
  document.body.append(root);
  const app = createApp({ setup: () => () => h(EditorContent, { editor }) });
  apps.push(app);
  app.mount(root);
  return { app, root };
}

describe("Vue document renderer", () => {
  it("mounts an asynchronously supplied editor and renders changes", async () => {
    const source = shallowRef<GoTipeEditor | null>(null);
    const { root } = mount(source);
    const editor = await makeEditor();
    const mounted = vi.spyOn(editor, "mount");
    source.value = editor;
    await nextTick();
    expect(mounted).toHaveBeenCalledOnce();
    expect(root.querySelector('[data-block-id="p"] strong')?.textContent).toBe("Hello");
    expect(root.querySelector('[data-block-id="task"]')?.textContent).toBe("Task");
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "p", offset: 5, text: "!", marks: [] }],
    });
    await nextTick();
    expect(root.querySelector('[data-block-id="p"]')?.textContent).toBe("Hello!");
  });

  it("updates tasks through transactions and reacts to read-only mode", async () => {
    const editor = await makeEditor();
    const { root } = mount(shallowRef(editor));
    await nextTick();
    const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    expect(editor.getViewState().blocks[1]?.children[0]?.attrs.checked).toBe(true);
    editor.setEditable(false);
    await nextTick();
    expect(checkbox.disabled).toBe(true);
    expect(root.querySelector("[data-gotipe-content]")?.getAttribute("contenteditable")).toBe(
      "false",
    );
  });

  it("unmounts replaced editors and leaves destruction to the owner", async () => {
    const first = await makeEditor();
    const second = await makeEditor();
    const source = shallowRef<GoTipeEditor | null>(first);
    const unmounted = vi.spyOn(first, "unmount");
    const destroyed = vi.spyOn(first, "destroy");
    mount(source);
    await nextTick();
    source.value = second;
    await nextTick();
    expect(unmounted).toHaveBeenCalledOnce();
    expect(destroyed).not.toHaveBeenCalled();
    source.value = null;
    await nextTick();
    expect(document.querySelector('[data-block-id="p"]')).toBeNull();
  });
});
