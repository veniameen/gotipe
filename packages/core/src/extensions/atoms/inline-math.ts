import type { GoTipeEditor } from "../../types/editor";
import { defineExtension } from "../../types/extension";
import { type AtomInfo, type AtomTarget, findAtom, insertAtom, updateAtom } from "./commands";
import { INLINE_ATOM_SUPPORT } from "./support";

/**
 * An inline formula: its TeX source as text, carrying the atomic `inlineMath` mark.
 * Markdown writes it as `$x^2$`, HTML as `<span data-type="math">x^2</span>`. Typesetting
 * is the host's view; without one the source shows.
 */
export const InlineMath = defineExtension({
  name: "inlineMath",
  atomSupport: INLINE_ATOM_SUPPORT,
  marks: [{ name: "inlineMath", attrs: { key: { type: "string" } }, rank: 210, atomic: true }],
});

/** Inserts a formula at the selection, or over `range`. */
export function insertInlineMath(editor: GoTipeEditor, tex: string, range?: AtomTarget): boolean {
  return !!tex.trim() && insertAtom(editor, "inlineMath", tex, {}, range);
}

/** The formula at the caret (or at `at`), or null. */
export const getInlineMath = (editor: GoTipeEditor, at?: { blockId: string; offset: number }) =>
  findAtom(editor, "inlineMath", at);

/** Replaces a formula's TeX in one step. */
export function updateInlineMath(editor: GoTipeEditor, formula: AtomInfo, tex: string): boolean {
  return !!tex.trim() && updateAtom(editor, formula, {}, tex);
}
