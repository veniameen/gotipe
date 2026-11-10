import type { GoTipeEditor } from "@gotipe/core";
import type { ViewState } from "@gotipe/core";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

export function useEditorState<T>(
  editor: GoTipeEditor | null,
  selector: (state: ViewState) => T,
  isEqual?: (a: T, b: T) => boolean,
): T | undefined {
  const committed = useRef<{ editor: GoTipeEditor | null; value: T | undefined } | null>(null);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!editor) return () => {};
      return editor.on("viewStateChange", onStoreChange);
    },
    [editor],
  );

  const getSnapshot = useMemo(() => {
    let previousState: ViewState | undefined;
    let previousValue: T;
    let hasValue = false;
    return () => {
      if (!editor) return undefined;
      const state = editor.getViewState();
      if (hasValue && Object.is(previousState, state)) return previousValue;

      let value = selector(state);
      if (hasValue && (isEqual ?? Object.is)(previousValue, value)) {
        value = previousValue;
      } else if (
        !hasValue &&
        isEqual &&
        committed.current?.editor === editor &&
        isEqual(committed.current.value as T, value)
      ) {
        // A caller may supply a new selector on every render. Reuse an equal
        // committed selection without sharing mutable caches across renders.
        value = committed.current.value as T;
      }
      previousState = state;
      previousValue = value;
      hasValue = true;
      return value;
    };
  }, [editor, selector, isEqual]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    committed.current = { editor, value };
  }, [editor, value]);
  return value;
}
