import { type CreateEditorOptions, type GoTipeEditor, createEditor } from "@gotipe/core";
import { type Accessor, createSignal, onCleanup, onMount } from "solid-js";

export interface UseEditorOptions extends CreateEditorOptions {
  /**
   * Called once when the editor cannot be created, with the same error as `error` of
   * `useEditorStatus`; without it the error is logged. A creation that ends after cleanup
   * reports nothing. Errors of a working editor go to `host.onError` and the `error` event.
   */
  onError?: (error: Error) => void;
}

/** What `useEditorStatus` returns. */
export interface EditorStatus {
  /** The editor, or `null` while it is created, after cleanup and when creation failed. */
  editor: Accessor<GoTipeEditor | null>;
  /** Why the editor could not be created; `null` while there is no error. */
  error: Accessor<Error | null>;
}

/**
 * Creates the editor in `onMount` and destroys it in `onCleanup`, like `useEditor`, and
 * also says why it could not be created. The options are read once, at mount.
 */
export function useEditorStatus(options: UseEditorOptions): EditorStatus {
  const [editor, setEditor] = createSignal<GoTipeEditor | null>(null);
  const [error, setError] = createSignal<Error | null>(null);
  let disposed = false;

  onMount(() => {
    const { onError, ...editorOptions } = options;
    createEditor(editorOptions).then(
      (instance) => {
        if (disposed) instance.destroy();
        else setEditor(instance);
      },
      (reason: unknown) => {
        if (disposed) return;
        const failure =
          reason instanceof Error ? reason : new Error(String(reason), { cause: reason });
        setError(failure);
        if (onError) onError(failure);
        else console.error("GoTipe: Failed to create editor:", failure);
      },
    );
  });

  onCleanup(() => {
    disposed = true;
    editor()?.destroy();
    setEditor(null);
  });

  return { editor, error };
}

/** Creates the editor after mount and destroys it on cleanup; `null` until it exists. */
export function useEditor(options: UseEditorOptions): Accessor<GoTipeEditor | null> {
  return useEditorStatus(options).editor;
}
