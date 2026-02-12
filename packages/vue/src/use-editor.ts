import { type CreateEditorOptions, type GoTipeEditor, createEditor } from "@gotipe/core";
import { type ShallowRef, onBeforeUnmount, onMounted, shallowRef } from "vue";

export interface UseEditorOptions extends CreateEditorOptions {}

export function useEditor(options: UseEditorOptions): ShallowRef<GoTipeEditor | null> {
  const editor = shallowRef<GoTipeEditor | null>(null);

  onMounted(async () => {
    const instance = await createEditor(options);
    editor.value = instance;
  });

  onBeforeUnmount(() => {
    editor.value?.destroy();
  });

  return editor;
}
