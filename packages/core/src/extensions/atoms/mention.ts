import type { GoTipeEditor } from "../../types/editor";
import { defineExtension } from "../../types/extension";
import { type AtomInfo, type AtomTarget, findAtom, insertAtom, updateAtom } from "./commands";
import { INLINE_ATOM_SUPPORT } from "./support";

export type MentionKind = "user" | "page";

export interface MentionAttrs {
  /** The host's id of the person or page. */
  id: string;
  /** The name shown: `@label` for a user, `label` for a page. */
  label: string;
  kind?: MentionKind;
}

/**
 * A mention: the text `@Anna` (or a page title) carrying the atomic `mention` mark with
 * `id`, `label` and `kind`. Markdown writes it as `[@Anna](mention:user-42)`, HTML as
 * `<span data-type="mention" data-id="42">@Anna</span>`. Rendering it as a chip is the
 * host's view; without one the text shows.
 */
export const Mention = defineExtension({
  name: "mention",
  atomSupport: INLINE_ATOM_SUPPORT,
  marks: [
    {
      name: "mention",
      attrs: {
        id: { type: "string", required: true },
        label: { type: "string", required: true },
        kind: { type: "enum", values: ["user", "page"], default: "user" },
        key: { type: "string" },
      },
      rank: 200,
      atomic: true,
    },
  ],
});

/** The text of a mention: a user's label after `@`, a page's label as it is. */
export const mentionText = (attrs: MentionAttrs): string =>
  attrs.kind === "page" ? attrs.label : `@${attrs.label}`;

/** Inserts a mention at the selection, or over `range` (a suggestion's trigger and query). */
export function insertMention(
  editor: GoTipeEditor,
  attrs: MentionAttrs,
  range?: AtomTarget,
): boolean {
  if (!attrs.id || !attrs.label) return false;
  const kind = attrs.kind === "page" ? "page" : "user";
  return insertAtom(
    editor,
    "mention",
    mentionText({ ...attrs, kind }),
    { id: attrs.id, label: attrs.label, kind },
    range,
  );
}

/** The mention at the caret (or at `at`), or null. */
export const getMention = (editor: GoTipeEditor, at?: { blockId: string; offset: number }) =>
  findAtom(editor, "mention", at);

/** Renames or retargets a mention in one step; a new label rewrites its text. */
export function updateMention(
  editor: GoTipeEditor,
  mention: AtomInfo,
  attrs: Partial<MentionAttrs>,
): boolean {
  const next = { ...(mention.mark.attrs as unknown as MentionAttrs), ...attrs };
  if (!next.id || !next.label) return false;
  return updateAtom(editor, mention, { ...attrs }, mentionText(next));
}
