import { type CreateEditorOptions, type GoTipeEditor, createEditor } from "@gotipe/core";
import { type Accessor, createSignal, onCleanup, onMount } from "solid-js";

export interface UseEditorOptions extends CreateEditorOptions {}

export function useEditor(options: UseEditorOptions): Accessor<GoTipeEditor | null> {
  const [editor, setEditor] = createSignal<GoTipeEditor | null>(null);
  let disposed = false;

  onMount(async () => {
    const instance = await createEditor(options);
    if (disposed) {
      instance.destroy();
      return;
    }
    setEditor(instance);
  });

  onCleanup(() => {
    disposed = true;
    editor()?.destroy();
    setEditor(null);
  });

  return editor;
}
