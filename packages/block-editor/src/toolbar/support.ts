import type { GoTipeEditor } from "@gotipe/core";
import { isInvisibleCharactersVisible, setInvisibleCharacters } from "@gotipe/core/extensions";

/**
 * What an editor can do that the fixed toolbar shows only when it can. The answers do not change
 * during an editor's life (extensions are set at creation), so each is asked once.
 */
const fonts = new WeakMap<GoTipeEditor, boolean>();
const invisibles = new WeakMap<GoTipeEditor, boolean>();

/** Whether the schema has the `fontFamily` and `fontSize` marks (`FontFamily`, `FontSize`). */
export function hasFontMarks(editor: GoTipeEditor): boolean {
  let known = fonts.get(editor);
  if (known === undefined) {
    known = editor.validate({
      version: 1,
      blocks: [
        {
          id: "font-probe",
          type: "paragraph",
          attrs: {},
          content: [
            {
              text: "a",
              marks: [
                { type: "fontFamily", attrs: { family: "serif" } },
                { type: "fontSize", attrs: { size: 15 } },
              ],
            },
          ],
          children: [],
        },
      ],
    });
    fonts.set(editor, known);
  }
  return known;
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
