import { type CreateEditorOptions, type GoTipeEditor, createEditor } from "@gotipe/core";
import { type Accessor, createSignal, onCleanup, onMount } from "solid-js";

export interface UseEditorOptions extends CreateEditorOptions {}

export function useEditor(options: UseEditorOptions): Accessor<GoTipeEditor | null> {
  const [editor, setEditor] = createSignal<GoTipeEditor | null>(null);

  onMount(async () => {
    const instance = await createEditor(options);
    setEditor(instance);
  });

  onCleanup(() => {
    editor()?.destroy();
  });

  return editor;
}
