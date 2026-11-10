import {
  type CreateEditorOptions,
  type GoTipeEditor,
  type ViewState,
  createEditor,
} from "@gotipe/core";

export interface EditorStore {
  editor: GoTipeEditor | null;
  state: ViewState | undefined;
  subscribe: (
    fn: (value: { editor: GoTipeEditor | null; state: ViewState | undefined }) => void,
  ) => () => void;
  destroy: () => void;
}

/**
 * Svelte 5 adapter using $state-compatible store pattern.
 * Usage in Svelte 5:
 *   import { onDestroy } from 'svelte';
 *   const store = createEditorState({ extensions: [...] });
 *   onDestroy(() => store.destroy());
 */
export function createEditorState(options: CreateEditorOptions): EditorStore {
  let editor: GoTipeEditor | null = null;
  let viewState: ViewState | undefined = undefined;
  let unsub: (() => void) | null = null;
  let destroyed = false;
  const subscribers = new Set<
    (value: { editor: GoTipeEditor | null; state: ViewState | undefined }) => void
  >();

  function notify(): void {
    const value = { editor, state: viewState };
    for (const fn of subscribers) {
      fn(value);
    }
  }

  // Initialize async
  createEditor(options).then((ed) => {
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
  });

  return {
    get editor() {
      return editor;
    },
    get state() {
      return viewState;
    },
    subscribe(fn) {
      fn({ editor, state: viewState });
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
