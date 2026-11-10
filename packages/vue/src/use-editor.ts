import { type CreateEditorOptions, type GoTipeEditor, createEditor } from "@gotipe/core";
import { type ShallowRef, onBeforeUnmount, onMounted, shallowRef } from "vue";

export interface UseEditorOptions extends CreateEditorOptions {}

export function useEditor(options: UseEditorOptions): ShallowRef<GoTipeEditor | null> {
  const editor = shallowRef<GoTipeEditor | null>(null);
  let disposed = false;

  onMounted(async () => {
    const instance = await createEditor(options);
    if (disposed) {
      instance.destroy();
      return;
    }
    editor.value = instance;
  });

  onBeforeUnmount(() => {
    disposed = true;
    editor.value?.destroy();
    editor.value = null;
  });

  return editor;
}
