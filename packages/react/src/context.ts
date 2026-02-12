import type { GoTipeEditor } from "@gotipe/core";
import { createContext, useContext } from "react";

export const EditorContext = createContext<GoTipeEditor | null>(null);

export function useEditorContext(): GoTipeEditor {
  const editor = useContext(EditorContext);
  if (!editor) {
    throw new Error("useEditorContext must be used within an <Editor> component");
  }
  return editor;
}
