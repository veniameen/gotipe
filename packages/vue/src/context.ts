import type { GoTipeEditor } from "@gotipe/core";
import type { InjectionKey, ShallowRef } from "vue";
import { inject, unref } from "vue";

export const editorKey: InjectionKey<GoTipeEditor | Readonly<ShallowRef<GoTipeEditor | null>>> =
  Symbol("gotipe-editor");

export function useEditorContext(): GoTipeEditor {
  const editor = unref(inject(editorKey));
  if (!editor) {
    throw new Error("useEditorContext must be used within a GoTipe editor provider");
  }
  return editor;
}
