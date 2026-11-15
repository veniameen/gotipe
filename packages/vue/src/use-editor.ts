import { type CreateEditorOptions, type GoTipeEditor, createEditor } from "@gotipe/core";
import { type ShallowRef, onBeforeUnmount, onMounted, shallowRef } from "vue";

export interface UseEditorOptions extends CreateEditorOptions {
  /**
   * Called once when the editor cannot be created, with the same error as `error` of
   * `useEditorStatus`; without it the error is logged. A creation that ends after unmount
   * reports nothing. Errors of a working editor go to `host.onError` and the `error` event.
   */
  onError?: (error: Error) => void;
}

/** What `useEditorStatus` returns. */
export interface EditorStatus {
  /** The editor, or `null` while it is created, after unmount and when creation failed. */
  editor: ShallowRef<GoTipeEditor | null>;
  /** Why the editor could not be created; `null` while there is no error. */
  error: ShallowRef<Error | null>;
}

/**
 * Creates the editor in `onMounted` and destroys it in `onBeforeUnmount`, like `useEditor`,
 * and also says why it could not be created. The options are read once, at mount.
 */
export function useEditorStatus(options: UseEditorOptions): EditorStatus {
  const editor = shallowRef<GoTipeEditor | null>(null);
  const error = shallowRef<Error | null>(null);
  let disposed = false;

  onMounted(() => {
    const { onError, ...rest } = options;
    return createEditor(rest).then(
      (ed) => {
        if (disposed) ed.destroy();
        else editor.value = ed;
      },
      (reason: unknown) => {
        if (disposed) return;
        error.value =
          reason instanceof Error ? reason : new Error(String(reason), { cause: reason });
        if (onError) onError(error.value);
        else console.error("GoTipe: Failed to create editor:", error.value);
      },
    );
  });

  onBeforeUnmount(() => {
    disposed = true;
    editor.value?.destroy();
    editor.value = null;
  });

  return { editor, error };
}

/** Creates the editor after mount and destroys it on unmount; `null` until it exists. */
export function useEditor(options: UseEditorOptions): ShallowRef<GoTipeEditor | null> {
  return useEditorStatus(options).editor;
}
