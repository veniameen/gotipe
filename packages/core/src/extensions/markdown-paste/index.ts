import { defineExtension } from "../../types/extension";
import { markdownBlocks } from "./blocks";
import { looksLikeMarkdown } from "./detect";

export { looksLikeMarkdown } from "./detect";

export interface MarkdownPasteOptions {
  /** Longer plain text is pasted as paragraphs without parsing. Default 1 000 000. */
  maxLength: number;
  /**
   * Registered custom emoji, name → image address: `:name:` is pasted as a custom emoji
   * when the editor has the `CustomEmoji` extension.
   */
  customEmoji?: Record<string, string>;
}

/**
 * Plain clipboard text that is clearly Markdown (see `looksLikeMarkdown`) is pasted as blocks
 * parsed by `@gotipe/markdown`, in one undo step. GoTipe and HTML clipboard data keep their
 * priority, raw-text blocks receive the text as is, and constructs outside the schema or with
 * unsafe addresses are pasted as their Markdown source. Mentions, formulas, images in the line
 * and custom emoji become inline atoms when the schema has their atomic marks.
 */
export const MarkdownPaste = defineExtension<MarkdownPasteOptions>({
  name: "markdownPaste",
  options: { maxLength: 1_000_000 },
  parsePastedText(text, context) {
    const { maxLength, customEmoji } = context.options as MarkdownPasteOptions;
    const mentions = context.marks.mention?.atomic === true;
    if (text.length > maxLength || !looksLikeMarkdown(text, { mentions })) return null;
    return markdownBlocks(text, context, customEmoji);
  },
});
