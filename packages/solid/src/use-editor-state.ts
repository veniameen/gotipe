import type { GoTipeEditor } from "@gotipe/core";
import type { ViewState } from "@gotipe/core";
import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";

export function useEditorState<T>(
  editor: Accessor<GoTipeEditor | null>,
  selector: (state: ViewState) => T,
): Accessor<T | undefined> {
  const [value, setValue] = createSignal<T | undefined>(undefined);

  createEffect(() => {
    const ed = editor();
    if (!ed) {
      setValue(() => undefined as T | undefined);
      return;
    }

    setValue(() => selector(ed.getViewState()));

    const unsub = ed.on("viewStateChange", (state) => {
      setValue(() => selector(state));
    });

    onCleanup(unsub);
  });

  return value;
}
