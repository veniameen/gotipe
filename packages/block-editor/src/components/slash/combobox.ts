import type { GoTipeEditor } from "@gotipe/core";
import { useEffect } from "react";

const ATTRS = ["aria-controls", "aria-expanded", "aria-autocomplete", "aria-activedescendant"];

/**
 * A list at the caret keeps the focus in the document: the editor element, which has the
 * focus, names the list and its chosen row (`aria-activedescendant`), as a combobox does.
 */
export function useListOwner(
  editor: GoTipeEditor,
  listId: string | null,
  activeId: string | null,
): void {
  useEffect(() => {
    const element = editor.element;
    if (!element || !listId) return;
    element.setAttribute("aria-controls", listId);
    element.setAttribute("aria-expanded", "true");
    element.setAttribute("aria-autocomplete", "list");
    if (activeId) element.setAttribute("aria-activedescendant", activeId);
    else element.removeAttribute("aria-activedescendant");
    return () => {
      for (const name of ATTRS) element.removeAttribute(name);
    };
  }, [editor, listId, activeId]);
}
