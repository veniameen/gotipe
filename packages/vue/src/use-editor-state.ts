import type { GoTipeEditor } from "@gotipe/core";
import type { ViewState } from "@gotipe/core";
import { type ShallowRef, onBeforeUnmount, shallowRef, triggerRef, watchEffect } from "vue";

export function useEditorState<T>(
  editor: ShallowRef<GoTipeEditor | null>,
  selector: (state: ViewState) => T,
): ShallowRef<T | undefined> {
  const result = shallowRef<T | undefined>(undefined);
  let unsub: (() => void) | null = null;

  watchEffect(() => {
    unsub?.();
    const ed = editor.value;
    if (!ed) {
      result.value = undefined;
      return;
    }

    result.value = selector(ed.getViewState());

    unsub = ed.on("viewStateChange", (state) => {
      result.value = selector(state);
      triggerRef(result);
    });
  });

  onBeforeUnmount(() => {
    unsub?.();
  });

  return result;
}
