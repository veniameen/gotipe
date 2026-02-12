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
 *   const store = createEditorState({ extensions: [...] });
 *   $effect(() => { store.destroy; }); // cleanup
 */
export function createEditorState(options: CreateEditorOptions): EditorStore {
  let editor: GoTipeEditor | null = null;
  let viewState: ViewState | undefined = undefined;
  let unsub: (() => void) | null = null;
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
      subscribers.add(fn);
      fn({ editor, state: viewState });
      return () => subscribers.delete(fn);
    },
    destroy() {
      unsub?.();
      editor?.destroy();
      editor = null;
      viewState = undefined;
      subscribers.clear();
    },
  };
}
