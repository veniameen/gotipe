import { GoTipeI18nProvider } from "@gotipe/react";
import type React from "react";
import { useBlockEditorI18n } from "./strings";

/** Gives the components below it the block editor's strings under the current `I18n`. */
export function BlockEditorStrings({ children }: { children: React.ReactNode }) {
  return <GoTipeI18nProvider i18n={useBlockEditorI18n()}>{children}</GoTipeI18nProvider>;
}
