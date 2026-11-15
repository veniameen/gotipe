import type { GoTipeEditor } from "@gotipe/core";

/**
 * Which marks the editor's schema has: a tool for a mark the editor lacks is not shown. Extensions
 * are set when an editor is created, so each mark is asked once — whether one character carrying
 * it, with `attrs` the mark accepts, passes `validate`.
 */
const known = new WeakMap<GoTipeEditor, Map<string, boolean>>();

export function hasMark(
  editor: GoTipeEditor,
  type: string,
  attrs: Record<string, unknown> = {},
): boolean {
  let marks = known.get(editor);
  if (!marks) {
    marks = new Map();
    known.set(editor, marks);
  }
  let answer = marks.get(type);
  if (answer === undefined) {
    answer = editor.validate({
      version: 1,
      blocks: [
        {
          id: "mark-probe",
          type: "paragraph",
          attrs: {},
          content: [{ text: "a", marks: [{ type, attrs }] }],
          children: [],
        },
      ],
    });
    marks.set(type, answer);
  }
  return answer;
}
