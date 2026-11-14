import type { GoTipeEditor, ViewState } from "@gotipe/core";
import { useEditorState } from "@gotipe/react";
import { useEffect, useState } from "react";
import { useBlockEditorI18n } from "../../i18n/strings";
import { blockPath } from "./selection";

/**
 * Why a tool can't act now (Atlas frame 31: an unavailable tool says why in its tooltip). A tool
 * with a reason stays in the keyboard path as `aria-disabled` and describes itself with it.
 */

/** The text of the block under the caret: rich text takes marks, raw text (code, TeX) does not. */
export type TextKind = "rich" | "raw" | "none";

export function textKind(state: ViewState): TextKind {
  const block = blockPath(state.blocks, state.selection.anchor.blockId).at(-1);
  if (!block) return "none";
  if (Array.isArray(block.content)) return "rich";
  return typeof block.content === "string" ? "raw" : "none";
}

/** Whether the editor takes input, following `editableChange`. */
export function useEditable(editor: GoTipeEditor): boolean {
  const [editable, setEditable] = useState(editor.isEditable);
  useEffect(() => {
    setEditable(editor.isEditable);
    return editor.on("editableChange", setEditable);
  }, [editor]);
  return editable;
}

/** The reason of a tool that changes the document: the editor is read-only. */
export function useEditReason(editor: GoTipeEditor): string | null {
  const i18n = useBlockEditorI18n();
  return useEditable(editor) ? null : i18n.t("toolbar.readOnly");
}

/** The reason of a tool that formats text: read-only, or a block whose text takes no marks. */
export function useFormatReason(editor: GoTipeEditor): string | null {
  const i18n = useBlockEditorI18n();
  const editable = useEditable(editor);
  const kind = useEditorState(editor, textKind) ?? "rich";
  if (!editable) return i18n.t("toolbar.readOnly");
  if (kind === "raw") return i18n.t("toolbar.noFormatting");
  if (kind === "none") return i18n.t("toolbar.noText");
  return null;
}
