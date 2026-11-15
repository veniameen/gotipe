import type { GoTipeEditor } from "@gotipe/core";
import { isInvisibleCharactersVisible, setInvisibleCharacters } from "@gotipe/core/extensions";
import { hasMark } from "../components/formatting/schema";

/**
 * What an editor can do that the fixed toolbar shows only when it can. The answers do not change
 * during an editor's life (extensions are set at creation), so each is asked once.
 */
const invisibles = new WeakMap<GoTipeEditor, boolean>();

/** Whether the schema has the `fontFamily` and `fontSize` marks (`FontFamily`, `FontSize`). */
export function hasFontMarks(editor: GoTipeEditor): boolean {
  return (
    hasMark(editor, "fontFamily", { family: "serif" }) && hasMark(editor, "fontSize", { size: 15 })
  );
}

/**
 * Whether the editor has `InvisibleCharacters`. Shown marks need it; when they are hidden,
 * hiding them again changes nothing and answers `false` without the extension.
 */
export function hasInvisibles(editor: GoTipeEditor): boolean {
  let known = invisibles.get(editor);
  if (known === undefined) {
    known = isInvisibleCharactersVisible(editor) || setInvisibleCharacters(editor, false);
    invisibles.set(editor, known);
  }
  return known;
}
