import { toSafeImageSrc } from "../../security/urls";
import type { GoTipeEditor } from "../../types/editor";
import { defineExtension } from "../../types/extension";
import { type AtomTarget, insertAtom } from "./commands";
import { INLINE_ATOM_SUPPORT } from "./support";

export interface CustomEmojiAttrs {
  /** The shortcode without colons: letters, digits, `_`, `+` and `-`. */
  name: string;
  /** The image address; checked like other images. */
  src: string;
}

const NAME = /^[A-Za-z0-9_+-]+$/;

/**
 * A custom emoji: the text `:party:` carrying the atomic `customEmoji` mark with `name` and
 * `src`. Markdown writes `:party:` (read back only for registered names), HTML an `<img>`
 * with the shortcode as alt. Unicode emoji are plain text and need no mark.
 */
export const CustomEmoji = defineExtension({
  name: "customEmoji",
  atomSupport: INLINE_ATOM_SUPPORT,
  marks: [
    {
      name: "customEmoji",
      attrs: {
        name: { type: "string", required: true },
        src: { type: "string", required: true },
        key: { type: "string" },
      },
      rank: 220,
      atomic: true,
    },
  ],
});

/** Inserts `:name:` as a custom emoji; false for a bad name or an unsafe address. */
export function insertCustomEmoji(
  editor: GoTipeEditor,
  attrs: CustomEmojiAttrs,
  range?: AtomTarget,
): boolean {
  const src = toSafeImageSrc(attrs.src);
  if (!NAME.test(attrs.name) || !src) return false;
  return insertAtom(editor, "customEmoji", `:${attrs.name}:`, { name: attrs.name, src }, range);
}
