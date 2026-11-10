import type { Document } from "../types/block";
import type { GoTipeEditor } from "../types/editor";
import type { PasteRule } from "../types/extension";
import type { SelectionView } from "../types/view";
import { documentTransaction } from "./document";
import { insertPayload } from "./insertion";
import type { ClipboardPayload } from "./selection";

export interface ConfiguredPasteRule {
  rule: PasteRule;
  options: unknown;
}
export interface ClipboardOptions {
  rules?: ConfiguredPasteRule[];
  /** An isolated editor with the same schema, without extension lifecycle side effects. */
  createDraft?: (document: Document, selection: SelectionView) => Promise<GoTipeEditor>;
}
export function findPasteRule(
  options: ClipboardOptions,
  data: File | string,
): ConfiguredPasteRule | undefined {
  const value = typeof data === "string" ? data : data.type;
  return options.rules?.find(({ rule }) => {
    rule.match.lastIndex = 0;
    const matches = rule.match.test(value);
    rule.match.lastIndex = 0;
    return matches;
  });
}
export function insertDraftPayload(editor: GoTipeEditor, payload: ClipboardPayload): void {
  const before = editor.getJSON();
  const plan = insertPayload(before, editor.getViewState().selection, payload);
  editor.dispatch(documentTransaction(before, plan.document, plan.caret));
}

/** Legacy handlers keep their editor/chain API; only the completed draft reaches the live editor. */
export async function runPasteRules(
  options: ClipboardOptions,
  data: (File | string)[],
  before: Document,
  selection: SelectionView,
  current: () => boolean,
  drafts: Set<GoTipeEditor>,
  fallback: (file: File) => Promise<ClipboardPayload>,
): Promise<{ document: Document; selection: SelectionView } | null> {
  if (!options.createDraft) return null;
  const draft = await options.createDraft(before, selection);
  drafts.add(draft);
  try {
    for (const entry of data) {
      if (!current()) return null;
      const configured = findPasteRule(options, entry);
      if (configured) await configured.rule.handler(draft, entry, configured.options);
      else if (typeof entry !== "string") insertDraftPayload(draft, await fallback(entry));
    }
    return current()
      ? { document: draft.getJSON(), selection: draft.getViewState().selection }
      : null;
  } finally {
    drafts.delete(draft);
    draft.destroy();
  }
}
