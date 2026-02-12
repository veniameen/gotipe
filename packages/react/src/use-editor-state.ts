import type { GoTipeEditor } from "@gotipe/core";
import type { ViewState } from "@gotipe/core";
import { useCallback, useRef, useSyncExternalStore } from "react";

export function useEditorState<T>(
  editor: GoTipeEditor | null,
  selector: (state: ViewState) => T,
  isEqual?: (a: T, b: T) => boolean,
): T | undefined {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!editor) return () => {};
      return editor.on("viewStateChange", onStoreChange);
    },
    [editor],
  );

  const getSnapshot = useCallback(() => {
    if (!editor) return undefined;
    return selectorRef.current(editor.getViewState());
  }, [editor]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
