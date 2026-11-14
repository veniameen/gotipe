import { findBlockInTree } from "../../document/tree";
import type { MarkView, ViewState } from "../../types/view";
import type { SuggestionRange } from "./types";

export interface TriggerRules {
  char: string;
  allowSpaces: boolean;
  startOfWord: boolean;
  maxQueryLength: number;
}

/** Atoms and inline code are not text a trigger may be typed into. */
const opaque = (mark: MarkView): boolean => mark.atomic === true || mark.type === "code";

/**
 * The trigger before a collapsed caret and the query typed after it, or null. The trigger
 * and the query must be plain text of one rich-text block.
 */
export function detectTrigger(
  view: ViewState,
  rules: TriggerRules,
): (SuggestionRange & { query: string }) | null {
  const { selection } = view;
  if (
    selection.type !== "text" ||
    !selection.anchor.blockId ||
    selection.anchor.blockId !== selection.head.blockId ||
    selection.anchor.offset !== selection.head.offset
  )
    return null;
  const block = findBlockInTree(view.blocks, selection.anchor.blockId);
  if (!block || !Array.isArray(block.content)) return null;
  const text = block.content.map((span) => span.text).join("");
  const caret = selection.anchor.offset;
  if (caret > text.length) return null;
  const from = text.lastIndexOf(rules.char, caret - rules.char.length);
  if (from < 0 || from + rules.char.length > caret) return null;
  const query = text.slice(from + rules.char.length, caret);
  if (query.length > rules.maxQueryLength || query.includes("\n")) return null;
  if (rules.allowSpaces ? /^\s/u.test(query) : /\s/u.test(query)) return null;
  if (rules.startOfWord && from > 0 && !/\s/u.test(text[from - 1]!)) return null;
  let offset = 0;
  for (const span of block.content) {
    const end = offset + span.text.length;
    if (end > from && offset < caret && span.marks.some(opaque)) return null;
    offset = end;
  }
  return { blockId: block.id, from, to: caret, query };
}
