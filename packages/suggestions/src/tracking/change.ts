import { type Block, type Document, GoTipeError, type Step } from "@gotipe/core";
import { type TextPatch, makeTextPatch, plain, reverseTextPatch } from "./text-patch";

export type TrackedChange =
  | { kind: "text"; patches: TextPatch[]; before: Block[]; after: Block[] }
  | { kind: "structure"; before: Document; after: Document; changedIds: string[] };
export function findBlock(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const nested = findBlock(block.children, id);
    if (nested) return nested;
  }
}
const key = (block: Block) => JSON.stringify(block);
function sameShape(a: Block[], b: Block[]): boolean {
  return (
    a.length === b.length &&
    a.every((block, i) => {
      const other = b[i]!;
      return (
        block.id === other.id &&
        block.type === other.type &&
        JSON.stringify(block.attrs) === JSON.stringify(other.attrs) &&
        (block.content === null) === (other.content === null) &&
        (typeof block.content === "string") === (typeof other.content === "string") &&
        sameShape(block.children, other.children)
      );
    })
  );
}
export function createTrackedChange(before: Document, after: Document): TrackedChange | null {
  if (!sameShape(before.blocks, after.blocks)) {
    const previous = new Map(before.blocks.map((block) => [block.id, block]));
    const next = new Map(after.blocks.map((block) => [block.id, block]));
    const oldOrder = before.blocks.filter((block) => next.has(block.id)).map((block) => block.id);
    const newOrder = after.blocks
      .filter((block) => previous.has(block.id))
      .map((block) => block.id);
    const changedIds = [...new Set([...previous.keys(), ...next.keys()])].filter((id) => {
      const a = previous.get(id);
      const b = next.get(id);
      return !a || !b || key(a) !== key(b) || oldOrder.indexOf(id) !== newOrder.indexOf(id);
    });
    return {
      kind: "structure",
      before: structuredClone(before),
      after: structuredClone(after),
      changedIds,
    };
  }
  const patches: TextPatch[] = [];
  const previous: Block[] = [];
  const next: Block[] = [];
  const visit = (a: Block[], b: Block[]) => {
    for (let i = 0; i < a.length; i++) {
      const patch = makeTextPatch(a[i]!, b[i]!);
      if (patch) {
        patches.push(patch);
        previous.push({ ...a[i]!, children: [] });
        next.push({ ...b[i]!, children: [] });
      }
      visit(a[i]!.children, b[i]!.children);
    }
  };
  visit(before.blocks, after.blocks);
  return patches.length
    ? { kind: "text", patches, before: structuredClone(previous), after: structuredClone(next) }
    : null;
}
export function mergeTrackedChanges(
  previous: TrackedChange,
  next: TrackedChange,
): TrackedChange | null {
  if (
    previous.kind !== "text" ||
    next.kind !== "text" ||
    previous.patches.length !== 1 ||
    next.patches.length !== 1
  )
    return null;
  const a = previous.patches[0]!;
  const b = next.patches[0]!;
  if (a.blockId !== b.blockId || key(previous.after[0]!) !== key(next.before[0]!)) return null;
  if (b.from > a.from + plain(a.after).length || b.from + plain(b.before).length < a.from)
    return null;
  const patch = makeTextPatch(previous.before[0]!, next.after[0]!);
  return patch
    ? { kind: "text", patches: [patch], before: previous.before, after: next.after }
    : null;
}
export function reverseTrackedChange(change: TrackedChange, current: Document): Step[] {
  if (change.kind === "text") {
    const located = change.patches.map((patch) => {
      const block = findBlock(current.blocks, patch.blockId);
      if (!block) throw new GoTipeError("PROPOSAL_STALE", "A tracked block was removed");
      return { blockId: patch.blockId, ...reverseTextPatch(patch, block) };
    });
    return located
      .sort((a, b) => a.blockId.localeCompare(b.blockId) || b.from - a.from)
      .flatMap((item) => item.steps);
  }
  const ids = new Set(change.changedIds);
  for (const id of ids) {
    const expected = change.after.blocks.find((block) => block.id === id);
    const actual = current.blocks.find((block) => block.id === id);
    if (
      (!expected && findBlock(current.blocks, id)) ||
      (!!expected && (!actual || key(actual) !== key(expected)))
    )
      throw new GoTipeError("PROPOSAL_STALE", "A structurally changed block was edited again");
  }
  const steps: Step[] = [];
  const remaining = current.blocks.filter((block) => !ids.has(block.id));
  for (const block of current.blocks)
    if (ids.has(block.id)) steps.push({ type: "deleteBlock", blockId: block.id });
  for (let i = 0; i < change.before.blocks.length; i++) {
    const block = change.before.blocks[i]!;
    if (!ids.has(block.id)) continue;
    const next = change.before.blocks
      .slice(i + 1)
      .find((candidate) => remaining.some((item) => item.id === candidate.id));
    const prev = change.before.blocks
      .slice(0, i)
      .reverse()
      .find((candidate) => remaining.some((item) => item.id === candidate.id));
    const index = next
      ? remaining.findIndex((item) => item.id === next.id)
      : prev
        ? remaining.findIndex((item) => item.id === prev.id) + 1
        : Math.min(i, remaining.length);
    remaining.splice(index, 0, block);
    steps.push({ type: "insertBlock", parentId: null, index, block: structuredClone(block) });
  }
  return steps;
}

/** An undo can put the original content back without a review API call. */
export function isTrackedReverted(change: TrackedChange, current: Document): boolean {
  const inverse =
    change.kind === "structure"
      ? createTrackedChange(change.after, change.before)
      : createTrackedChange(
          { version: 1, blocks: change.after },
          { version: 1, blocks: change.before },
        );
  if (!inverse) return true;
  try {
    reverseTrackedChange(inverse, current);
    return true;
  } catch {
    return false;
  }
}
