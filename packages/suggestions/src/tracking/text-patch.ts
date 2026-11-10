import {
  type Block,
  type BlockContent,
  GoTipeError,
  type Mark,
  type Step,
  type TextSpan,
} from "@gotipe/core";
import { type TextAnchor, anchorAt, findAnchor } from "../anchors";

export interface TextPatch {
  blockId: string;
  from: number;
  before: TextSpan[];
  after: TextSpan[];
  anchor: TextAnchor;
  raw: boolean;
}
interface Unit {
  text: string;
  marks: Mark[];
  key: string;
}
export const plain = (content: BlockContent): string =>
  typeof content === "string" ? content : (content?.map((span) => span.text).join("") ?? "");
function units(content: BlockContent): Unit[] {
  const spans = typeof content === "string" ? [{ text: content, marks: [] }] : (content ?? []);
  return spans.flatMap((span) =>
    Array.from(span.text, (text) => ({ text, marks: span.marks, key: JSON.stringify(span.marks) })),
  );
}
function compact(items: Unit[]): TextSpan[] {
  const spans: TextSpan[] = [];
  for (const unit of items) {
    const last = spans.at(-1);
    if (last && JSON.stringify(last.marks) === unit.key) last.text += unit.text;
    else spans.push({ text: unit.text, marks: structuredClone(unit.marks) });
  }
  return spans;
}
export function makeTextPatch(before: Block, after: Block): TextPatch | null {
  const a = units(before.content);
  const b = units(after.content);
  const equal = (x: Unit, y: Unit) => x.text === y.text && x.key === y.key;
  let start = 0;
  while (start < a.length && start < b.length && equal(a[start]!, b[start]!)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && equal(a[endA - 1]!, b[endB - 1]!)) {
    endA--;
    endB--;
  }
  if (start === endA && start === endB) return null;
  const from = b.slice(0, start).reduce((offset, item) => offset + item.text.length, 0);
  const oldSpans = compact(a.slice(start, endA));
  const newSpans = compact(b.slice(start, endB));
  return {
    blockId: after.id,
    from,
    before: oldSpans,
    after: newSpans,
    raw: typeof after.content === "string",
    anchor: anchorAt(plain(after.content), from, from + plain(newSpans).length),
  };
}
function slice(content: BlockContent, from: number, to: number): TextSpan[] {
  const selected: Unit[] = [];
  let offset = 0;
  for (const unit of units(content)) {
    if (offset >= from && offset < to) selected.push(unit);
    offset += unit.text.length;
  }
  return compact(selected);
}
export function locatePatch(patch: TextPatch, block: Block): { from: number; to: number } {
  const found = findAnchor(plain(block.content), patch.anchor);
  if (!found.ok || (typeof block.content === "string") !== patch.raw)
    throw new GoTipeError(
      "PROPOSAL_STALE",
      "The tracked change no longer has an unambiguous text anchor",
    );
  if (JSON.stringify(slice(block.content, found.start, found.end)) !== JSON.stringify(patch.after))
    throw new GoTipeError("PROPOSAL_STALE", "The tracked text or formatting was edited again");
  return { from: found.start, to: found.end };
}
export function reverseTextPatch(patch: TextPatch, block: Block): { from: number; steps: Step[] } {
  const { from, to } = locatePatch(patch, block);
  const steps: Step[] = [];
  if (to > from) steps.push({ type: "deleteText", blockId: block.id, from, to });
  let offset = from;
  for (const span of patch.before) {
    steps.push({
      type: "insertText",
      blockId: block.id,
      offset,
      text: span.text,
      marks: structuredClone(span.marks),
    });
    offset += span.text.length;
  }
  return { from, steps };
}
