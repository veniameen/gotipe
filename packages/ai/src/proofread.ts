import type { GoTipeEditor, Step } from "@gotipe/core";
import { assertWritable, flatten, textOf, validOffset } from "./document";
import type { AiProofreadSuggestion } from "./types";

/** Validate every edit before assembling a single transaction/undo boundary. */
export function proofreadSteps(
  editor: GoTipeEditor,
  suggestions: AiProofreadSuggestion[],
  baselines: Map<string, string>,
): Step[] {
  assertWritable(editor);
  const blocks = new Map(flatten(editor.getJSON().blocks).map((block) => [block.id, block]));
  const grouped = new Map<string, AiProofreadSuggestion[]>();
  const ids = new Set<string>();
  for (const suggestion of suggestions) {
    if (ids.has(suggestion.id)) throw new Error("Duplicate AI suggestion ID");
    ids.add(suggestion.id);
    const block = blocks.get(suggestion.blockId);
    if (!block) throw new Error("AI suggestion refers to a removed block");
    const text = textOf(block);
    const baseline = baselines.get(suggestion.id);
    if (baseline !== undefined && baseline !== JSON.stringify(block)) {
      throw new Error("AI suggestion is stale. Proofread the document again.");
    }
    if (
      !validOffset(text, suggestion.from) ||
      !validOffset(text, suggestion.to) ||
      suggestion.from > suggestion.to ||
      text.slice(suggestion.from, suggestion.to) !== suggestion.originalText
    ) {
      throw new Error("AI suggestion no longer matches its original text");
    }
    if (
      !["insert", "delete", "replace"].includes(suggestion.type) ||
      (suggestion.type === "insert" && suggestion.from !== suggestion.to) ||
      typeof suggestion.suggestedText !== "string"
    ) {
      throw new Error("Invalid AI suggestion");
    }
    const group = grouped.get(block.id) ?? [];
    group.push(suggestion);
    grouped.set(block.id, group);
  }
  const steps: Step[] = [];
  for (const group of grouped.values()) {
    group.sort((a, b) => b.from - a.from || b.to - a.to);
    let boundary = Number.POSITIVE_INFINITY;
    for (const suggestion of group) {
      if (suggestion.to > boundary || suggestion.from === boundary)
        throw new Error("AI suggestions overlap");
      boundary = suggestion.from;
      if (suggestion.from !== suggestion.to)
        steps.push({
          type: "deleteText",
          blockId: suggestion.blockId,
          from: suggestion.from,
          to: suggestion.to,
        });
      if (suggestion.type !== "delete")
        steps.push({
          type: "insertText",
          blockId: suggestion.blockId,
          offset: suggestion.from,
          text: suggestion.suggestedText,
          marks: [],
        });
    }
  }
  return steps;
}
