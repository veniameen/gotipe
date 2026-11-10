import { type BlockView, GoTipeError, type Step } from "@gotipe/core";
import { type TextAnchor, findAnchor } from "./anchors";
import type { Suggestion } from "./types";

export function findBlock(blocks: BlockView[], id: string): BlockView | null {
  for (const block of blocks) {
    if (block.id === id) return block;
    const nested = findBlock(block.children, id);
    if (nested) return nested;
  }
  return null;
}
export function textOf(block: BlockView): string {
  return Array.isArray(block.content)
    ? block.content.map((span) => span.text).join("")
    : (block.content ?? "");
}
export function validateRange(text: string, from: number, to: number): void {
  const boundary = (offset: number) =>
    !(
      offset > 0 &&
      offset < text.length &&
      text.charCodeAt(offset - 1) >= 0xd800 &&
      text.charCodeAt(offset - 1) <= 0xdbff &&
      text.charCodeAt(offset) >= 0xdc00 &&
      text.charCodeAt(offset) <= 0xdfff
    );
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    to > text.length ||
    !boundary(from) ||
    !boundary(to)
  )
    throw new GoTipeError("PROPOSAL_ACTION_FAILED", "Invalid suggestion text range");
}
export function locateSuggestion(suggestion: Suggestion, anchor: TextAnchor, blocks: BlockView[]) {
  const block = findBlock(blocks, suggestion.blockId);
  if (!block || block.content === null)
    throw new GoTipeError("PROPOSAL_STALE", "The suggestion block no longer exists");
  const match = findAnchor(textOf(block), anchor);
  if (!match.ok)
    throw new GoTipeError("PROPOSAL_STALE", `The suggestion anchor is ${match.reason}`);
  validateRange(textOf(block), match.start, match.end);
  return { suggestion, block, from: match.start, to: match.end };
}
export function suggestionSteps(
  suggestion: Suggestion,
  block: BlockView,
  from: number,
  to: number,
): Step[] {
  if (suggestion.type === "structure")
    throw new GoTipeError(
      "PROPOSAL_ACTION_FAILED",
      "Structural changes require a captured transaction",
    );
  const blockId = block.id;
  if (suggestion.type === "format") {
    const format = suggestion.format;
    if (!Array.isArray(block.content) || !format || (!format.add?.length && !format.remove?.length))
      throw new GoTipeError(
        "PROPOSAL_ACTION_FAILED",
        "A format suggestion requires explicit marks and rich text",
      );
    return [
      ...(format.remove ?? []).map(
        (markType): Step => ({ type: "removeMark", blockId, from, to, markType }),
      ),
      ...(format.add ?? []).map(
        (mark): Step => ({ type: "addMark", blockId, from, to, mark: structuredClone(mark) }),
      ),
    ];
  }
  const steps: Step[] = [];
  if (suggestion.type !== "insert" && from !== to)
    steps.push({ type: "deleteText", blockId, from, to });
  if (suggestion.type !== "delete") {
    if (typeof suggestion.newContent !== "string")
      throw new GoTipeError("PROPOSAL_ACTION_FAILED", "The suggestion has no replacement text");
    if (suggestion.newContent) {
      let position = 0;
      const context = Array.isArray(block.content)
        ? (block.content.find((span) => {
            const end = position + span.text.length;
            const contains = from >= position && from <= end;
            position = end;
            return contains;
          })?.marks ?? [])
        : [];
      steps.push({
        type: "insertText",
        blockId,
        offset: from,
        text: suggestion.newContent,
        marks: structuredClone(suggestion.marks ?? context) as import("@gotipe/core").Mark[],
      });
    }
  }
  return steps;
}
