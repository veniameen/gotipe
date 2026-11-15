import { type CreateEditorOptions, type GoTipeEditor, createEditor } from "@gotipe/core";
import { useEffect, useRef, useState } from "react";

export interface UseEditorOptions extends CreateEditorOptions {
  /**
   * Called when the editor cannot be created, with the same error as `error` of
   * `useEditorStatus`; the latest callback passed is used. Without it the error is logged.
   * Errors of a working editor go to `host.onError` and the `error` event instead.
   */
  onError?: (error: Error) => void;
}

/** What `useEditorStatus` returns. */
export interface EditorStatus {
  /** The editor, or `null` while it is created, after unmount and when creation failed. */
  editor: GoTipeEditor | null;
  /** Why the editor could not be created; `null` while it is created and once it exists. */
  error: Error | null;
}

const EMPTY: EditorStatus = { editor: null, error: null };

/**
 * Creates the editor after mount and destroys it on unmount, like `useEditor`, and also
 * says why it could not be created. The options are read when the editor is created.
 */
export function useEditorStatus(options: UseEditorOptions): EditorStatus {
  const [status, setStatus] = useState<EditorStatus>(EMPTY);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let destroyed = false;
    let instance: GoTipeEditor | null = null;
    const { onError: _onError, ...editorOptions } = optionsRef.current;

    createEditor(editorOptions).then(
      (ed) => {
        if (destroyed) {
          ed.destroy();
          return;
        }
        instance = ed;
        setStatus({ editor: ed, error: null });
      },
      (reason: unknown) => {
        if (destroyed) return;
        const error =
          reason instanceof Error ? reason : new Error(String(reason), { cause: reason });
        setStatus({ editor: null, error });
        const { onError } = optionsRef.current;
        if (onError) onError(error);
        else console.error("GoTipe: Failed to create editor:", error);
      },
    );

    return () => {
      destroyed = true;
      instance?.destroy();
      // Created again (Activity, Fast Refresh): start empty, without the last error.
      setStatus(EMPTY);
    };
  }, []);

  return status;
}

/** Creates the editor after mount and destroys it on unmount; `null` until it exists. */
export function useEditor(options: UseEditorOptions): GoTipeEditor | null {
  return useEditorStatus(options).editor;
}
