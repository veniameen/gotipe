import type { Mark } from "../../types/block";
import type { Step } from "../../types/state";
import type { BlockView } from "../../types/view";
import type { CompiledSearch, SearchMatch } from "./search";

export const blockText = (block: BlockView) =>
  Array.isArray(block.content)
    ? block.content.map((span) => span.text).join("")
    : typeof block.content === "string"
      ? block.content
      : "";

/**
 * Marks of the match's first character for the new text, without atomic marks: a mention's
 * mark never moves to plain text. `null` when the match cuts an atomic element (a mention).
 */
function replacedMarks(block: BlockView, from: number, to: number): Mark[] | null {
  if (!Array.isArray(block.content)) return [];
  let marks: Mark[] | undefined;
  let end = 0;
  for (const span of block.content) {
    const start = end;
    end += span.text.length;
    if (end <= from || start >= to) continue;
    const atomic = span.marks.some((mark) => (mark as { atomic?: boolean }).atomic === true);
    if (atomic && (start < from || end > to)) return null;
    marks ??= span.marks
      .filter((mark) => (mark as { atomic?: boolean }).atomic !== true)
      .map((mark) => ({ type: mark.type, attrs: structuredClone(mark.attrs) }) as Mark);
  }
  return marks ?? [];
}

/**
 * The replacement for one match: literal, or a regex template expanded by the engine. The
 * expression runs at the match only: the search already found it there within its budget.
 */
function expand(value: string, match: SearchMatch, template: string, regex: CompiledSearch | null) {
  if (!regex) return template;
  const sticky = new RegExp(regex.source, regex.flags.replace("g", "y"));
  sticky.lastIndex = match.from;
  const found = sticky.exec(value);
  if (!found || found[0].length !== match.to - match.from) return template;
  sticky.lastIndex = match.from;
  const replaced = value.replace(sticky, template);
  return replaced.slice(match.from, replaced.length - (value.length - match.to));
}

/**
 * Steps replacing `match` in `block`, the new text with the marks of the replaced one; `null`
 * when the match cuts an atomic element or no longer fits the block. `regex` expands templates.
 */
export function replaceSteps(
  block: BlockView,
  match: SearchMatch,
  replacement: string,
  regex: CompiledSearch | null,
): Step[] | null {
  const value = blockText(block);
  if (match.to > value.length) return null;
  const marks = replacedMarks(block, match.from, match.to);
  if (!marks) return null;
  const insert = expand(value, match, replacement, regex);
  const steps: Step[] = [{ type: "deleteText", blockId: block.id, from: match.from, to: match.to }];
  if (insert)
    steps.push({ type: "insertText", blockId: block.id, offset: match.from, text: insert, marks });
  return steps;
}
