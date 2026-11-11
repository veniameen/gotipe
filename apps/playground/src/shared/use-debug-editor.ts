import type { GoTipeEditor } from "@gotipe/core";
import { useEffect } from "react";

declare global {
  interface Window {
    __GOTIPE_EDITOR__?: GoTipeEditor;
    __GOTIPE_NOTION_EDITOR__?: GoTipeEditor;
    __GOTIPE_VIEWS_EDITOR__?: GoTipeEditor;
  }
}

/** Development-only inspection handles with the same lifetime as their editor. */
export function useDebugEditor(
  key: "__GOTIPE_EDITOR__" | "__GOTIPE_NOTION_EDITOR__" | "__GOTIPE_VIEWS_EDITOR__",
  editor: GoTipeEditor | null,
) {
  useEffect(() => {
    if (!import.meta.env.DEV || !editor) return;
    window[key] = editor;
    return () => {
      if (window[key] === editor) delete window[key];
    };
  }, [key, editor]);
}
