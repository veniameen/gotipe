import type { GoTipeEditor } from "@gotipe/core";
import type { InjectionKey } from "vue";
import { inject } from "vue";

export const editorKey: InjectionKey<GoTipeEditor> = Symbol("gotipe-editor");

export function useEditorContext(): GoTipeEditor {
  const editor = inject(editorKey);
  if (!editor) {
    throw new Error("useEditorContext must be used within a GoTipe editor provider");
  }
  return editor;
}
