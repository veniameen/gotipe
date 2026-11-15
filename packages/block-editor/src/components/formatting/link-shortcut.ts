import type { GoTipeEditor, SelectionView } from "@gotipe/core";

/**
 * Mod+K: the core `Link` extension emits `openLinkDialog`, and one link field opens. Every mounted
 * `LinkEditor` offers its field; the one at the selection (the bubble, Atlas frame 6) is asked
 * before the fixed toolbar's, and a tool that can't act or is out of reach (in the toolbar's
 * closed «More») passes. Atlas draws the field only over selected text: with a caret alone the
 * key opens nothing.
 */
export interface LinkField {
  /** Stands at the selection (the bubble): asked before the others. */
  atSelection: boolean;
  /** Opens the field; `false` when this tool can't now. */
  open(): boolean;
}

interface Offers {
  fields: LinkField[];
  stop: () => void;
}

/** One `openLinkDialog` listener per editor while any field is offered. */
const offers = new WeakMap<GoTipeEditor, Offers>();

/** A text selection that covers at least one character. */
function hasSelectedText(selection: SelectionView): boolean {
  return (
    selection.type === "text" &&
    (selection.anchor.blockId !== selection.head.blockId ||
      selection.anchor.offset !== selection.head.offset)
  );
}

/** In the page and not inside an inert part (the fixed toolbar's closed «More»). */
export function reachable(element: HTMLElement | null): boolean {
  if (!element?.isConnected) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement)
    if (node.inert) return false;
  return true;
}

function ask(editor: GoTipeEditor, fields: readonly LinkField[]) {
  if (!editor.isEditable || !hasSelectedText(editor.getViewState().selection)) return;
  const order = [
    ...fields.filter((field) => field.atSelection),
    ...fields.filter((field) => !field.atSelection),
  ];
  for (const field of order) if (field.open()) return;
}

/** Offers `field` to Mod+K of `editor`; the returned function withdraws it. */
export function offerLinkField(editor: GoTipeEditor, field: LinkField): () => void {
  let entry = offers.get(editor);
  if (!entry) {
    const fields: LinkField[] = [];
    entry = { fields, stop: editor.on("openLinkDialog", () => ask(editor, fields)) };
    offers.set(editor, entry);
  }
  const owned = entry;
  owned.fields.push(field);
  return () => {
    const index = owned.fields.indexOf(field);
    if (index >= 0) owned.fields.splice(index, 1);
    if (owned.fields.length > 0 || offers.get(editor) !== owned) return;
    owned.stop();
    offers.delete(editor);
  };
}
