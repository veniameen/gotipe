import {
  type CreateEditorOptions,
  type GoTipeEditor,
  type ViewState,
  createEditor,
} from "@gotipe/core";

export interface CreateEditorStateOptions extends CreateEditorOptions {
  /**
   * Called once when the editor cannot be created, with the same error as `error`; without
   * it the error is logged. A creation that ends after `destroy()` reports nothing.
   * Errors of a working editor go to `host.onError` and the `error` event instead.
   */
  onError?: (error: Error) => void;
}

/** What `subscribe` gives: the editor, its view and why it could not be created. */
export interface EditorStoreValue {
  editor: GoTipeEditor | null;
  state: ViewState | undefined;
  /** Why the editor could not be created; `null` while there is no error. */
  error: Error | null;
}

export interface EditorStore {
  editor: GoTipeEditor | null;
  state: ViewState | undefined;
  /** Why the editor could not be created; `null` while there is no error. */
  error: Error | null;
  subscribe: (fn: (value: EditorStoreValue) => void) => () => void;
  destroy: () => void;
}

/**
 * Svelte 5 adapter using $state-compatible store pattern. The editor is created
 * in the browser only: during a server render the store stays empty.
 * Usage in Svelte 5:
 *   import { onDestroy } from 'svelte';
 *   const store = createEditorState({ extensions: [...], onError: report });
 *   onDestroy(() => store.destroy());
 */
export function createEditorState(options: CreateEditorStateOptions): EditorStore {
  let editor: GoTipeEditor | null = null;
  let viewState: ViewState | undefined = undefined;
  let error: Error | null = null;
  let unsub: (() => void) | null = null;
  let destroyed = false;
  const subscribers = new Set<(value: EditorStoreValue) => void>();

  function notify(): void {
    const value = { editor, state: viewState, error };
    for (const fn of subscribers) {
      fn(value);
    }
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const { onError, ...editorOptions } = options;
    createEditor(editorOptions).then(
      (ed) => {
        if (destroyed) {
          ed.destroy();
          return;
        }
        editor = ed;
        viewState = ed.getViewState();
        unsub = ed.on("viewStateChange", (state) => {
          viewState = state;
          notify();
        });
        notify();
      },
      (reason: unknown) => {
        if (destroyed) return;
        error = reason instanceof Error ? reason : new Error(String(reason), { cause: reason });
        notify();
        if (onError) onError(error);
        else console.error("GoTipe: Failed to create editor:", error);
      },
    );
  }

  return {
    get editor() {
      return editor;
    },
    get state() {
      return viewState;
    },
    get error() {
      return error;
    },
    subscribe(fn) {
      fn({ editor, state: viewState, error });
      if (destroyed) return () => {};
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsub?.();
      unsub = null;
      editor?.destroy();
      editor = null;
      viewState = undefined;
      notify();
      subscribers.clear();
    },
  };
}
