import { type IsAtomic, atomRanges, markType } from "../engine/atoms";
import { type AtomBlock, atomTexts, normalizeRemoteAtoms } from "../engine/remote-atoms";
import type { AttrValue, Block, Document, TextSpan } from "../types/block";
import type { Step } from "../types/state";

type RemoveMark = Extract<Step, { type: "removeMark" }>;
interface ViewBlock extends AtomBlock {
  id: string;
  children: readonly ViewBlock[];
}

/** The last text of every atom an editor saw, by identity; one memory per editor's `isAtomic`. */
const seen = new WeakMap<IsAtomic, Map<string, string>>();
const memory = (isAtomic: IsAtomic) => {
  const known = seen.get(isAtomic) ?? new Map<string, string>();
  seen.set(isAtomic, known);
  return known;
};

/** `rememberAtoms` for the blocks a serialized wire transaction names. */
export function rememberLocal(
  blocks: readonly ViewBlock[],
  transaction: string,
  isAtomic?: IsAtomic,
) {
  if (!isAtomic) return;
  const ids = new Set<string>();
  for (const step of (JSON.parse(transaction) as { steps: Record<string, unknown>[] }).steps) {
    const data = Object.values(step)[0] as Record<string, unknown> | undefined;
    for (const key of ["block_id", "target_id"])
      if (typeof data?.[key] === "string") ids.add(data[key] as string);
  }
  rememberAtoms(blocks, isAtomic, ids);
}

/**
 * Remembers the atoms of the blocks a local transaction is about to change (`ids`, with
 * their descendants), so an atom deleted here is known when a peer's text inside it arrives.
 */
export function rememberAtoms(
  blocks: readonly ViewBlock[],
  isAtomic: IsAtomic,
  ids: ReadonlySet<string>,
): void {
  const touched: ViewBlock[] = [];
  const visit = (list: readonly ViewBlock[]) => {
    for (const block of list) {
      if (ids.has(block.id)) touched.push(block);
      else visit(block.children);
    }
  };
  visit(blocks);
  if (!touched.length) return;
  const known = memory(isAtomic);
  for (const [id, texts] of atomTexts(touched, isAtomic))
    if (texts.length === 1) known.set(id, texts[0]!);
}

/**
 * The repair of remote text inside inline atoms (`normalizeRemoteAtoms`) as steps both
 * engines apply as written. A mark step inside an atom acts on the whole atom, so the
 * `removeMark` over only the foreign text would strip the atom. Instead every touched
 * atom loses its atomic marks as a whole and the repaired pieces get them back.
 */
export function remoteAtomRepair(before: Document, after: Document, isAtomic: IsAtomic): Step[] {
  // What this editor saw of each atom, so an atom deleted here and typed into elsewhere
  // (an orphan) is recognised.
  const known = memory(isAtomic);
  const { document, steps } = normalizeRemoteAtoms(before, after, isAtomic, known);
  for (const state of [before, document])
    for (const [id, texts] of atomTexts(state.blocks, isAtomic))
      if (texts.length === 1) known.set(id, texts[0]!);
  const removals = steps.filter((step): step is RemoveMark => step.type === "removeMark");
  if (!removals.length) return [];
  const merged = contents(after.blocks);
  const repaired = contents(document.blocks);
  const repair: Step[] = [];
  for (const blockId of new Set(removals.map((step) => step.blockId))) {
    const pieces = atomRanges(repaired.get(blockId) ?? [], isAtomic);
    const touched = atomRanges(merged.get(blockId) ?? [], isAtomic).filter((atom) =>
      removals.some(
        (step) => step.blockId === blockId && step.from < atom.to && step.to > atom.from,
      ),
    );
    for (const atom of touched) {
      for (const mark of atom.marks)
        repair.push({ type: "removeMark", blockId, ...range(atom), markType: markType(mark) });
      for (const piece of pieces) {
        if (piece.from < atom.from || piece.to > atom.to) continue;
        for (const mark of piece.marks)
          repair.push({
            type: "addMark",
            blockId,
            ...range(piece),
            mark: { type: markType(mark), attrs: { ...(mark.attrs as Record<string, AttrValue>) } },
          });
      }
    }
  }
  return repair;
}

const range = ({ from, to }: { from: number; to: number }) => ({ from, to });

function contents(blocks: Block[], into = new Map<string, TextSpan[]>()) {
  for (const block of blocks) {
    if (Array.isArray(block.content)) into.set(block.id, block.content);
    contents(block.children, into);
  }
  return into;
}
