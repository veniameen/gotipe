import type { GoTipeEditor } from "@gotipe/core";

export function exportToPlainText(editor: GoTipeEditor): string {
  return editor.getText();
}
