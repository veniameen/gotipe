import type { IsAtomic } from "../types/atoms";
import { sameValue } from "./mark-rules";

export type { IsAtomic };

/**
 * Inline atoms (docs/development/inline-atoms.md): text whose mark is declared `atomic`
 * is one indivisible element. An atom is the maximal run of spans that carry the same
 * atomic marks with equal attributes. `crates/gotipe-core/src/atoms.rs` is the Rust
 * engine's copy; both engines must find the same atoms and move the same offsets.
 */

/** A mark of the wire format (`mark_type`) or of the public model (`type`). */
export interface AnyMark {
  type?: string;
  mark_type?: string;
  attrs?: Record<string, unknown>;
}
interface AnySpan {
  text: string;
  marks?: readonly AnyMark[];
}

/** `[from, to)` in UTF-16 units of one atom in a block's text. */
export interface AtomRange {
  from: number;
  to: number;
}

/** An atom with its atomic marks: what makes it one element. */
export interface Atom extends AtomRange {
  marks: AnyMark[];
}

export const markType = (mark: AnyMark): string => mark.type ?? mark.mark_type ?? "";

function atomKey(span: AnySpan, isAtomic: IsAtomic): AnyMark[] {
  return (span.marks ?? []).filter((mark) => isAtomic(markType(mark)));
}

export function sameKey(a: readonly AnyMark[], b: readonly AnyMark[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (mark, i) =>
        markType(mark) === markType(b[i]!) && sameValue(mark.attrs ?? {}, b[i]!.attrs ?? {}),
    )
  );
}

/** The atoms of a block's spans, in order. */
export function atomRanges(spans: readonly AnySpan[], isAtomic: IsAtomic): Atom[] {
  const atoms: Atom[] = [];
  let previous: AnyMark[] = [];
  let offset = 0;
  for (const span of spans) {
    const key = atomKey(span, isAtomic);
    const end = offset + span.text.length;
    const last = atoms[atoms.length - 1];
    if (key.length && last && last.to === offset && sameKey(previous, key)) last.to = end;
    else if (key.length && span.text.length) atoms.push({ from: offset, to: end, marks: key });
    if (span.text.length) previous = key;
    offset = end;
  }
  return atoms;
}

/** The atom that strictly contains `offset` (not at one of its edges), or null. */
export function atomAt(atoms: readonly AtomRange[], offset: number): AtomRange | null {
  return atoms.find((atom) => atom.from < offset && offset < atom.to) ?? null;
}

/** `offset`, or the nearer edge of the atom around it; a tie goes to the end. */
export function nearestEdge(atoms: readonly AtomRange[], offset: number): number {
  const atom = atomAt(atoms, offset);
  if (!atom) return offset;
  return offset - atom.from < atom.to - offset ? atom.from : atom.to;
}

/**
 * A caret moved to `offset` from `previous` (in the same block, or null): inside an atom
 * it goes on to the edge in the direction of movement, else to the nearer edge.
 */
export function snapOffset(
  atoms: readonly AtomRange[],
  offset: number,
  previous: number | null,
): number {
  const atom = atomAt(atoms, offset);
  if (!atom) return offset;
  if (previous !== null && previous <= atom.from) return atom.to;
  if (previous !== null && previous >= atom.to) return atom.from;
  return nearestEdge(atoms, offset);
}

/** A non-empty range that touches part of an atom grows to cover the whole atom. */
export function expandRange(atoms: readonly AtomRange[], from: number, to: number): AtomRange {
  if (from >= to) return { from, to };
  return { from: atomAt(atoms, from)?.from ?? from, to: atomAt(atoms, to)?.to ?? to };
}

interface WireStepData {
  block_id?: unknown;
  offset?: unknown;
  from?: unknown;
  to?: unknown;
}
interface WireBlockContent {
  content: { type: string; value?: unknown };
}

/**
 * A wire step (`{ InsertText: {...} }`) with its offsets moved off atoms: text and splits go
 * to the nearer edge, deletions and marks cover whole atoms. Other steps, blocks without rich
 * text and offsets outside the text are returned unchanged, so the step reports its own error.
 */
export function normalizeAtomStep<Step extends Record<string, unknown>>(
  step: Step,
  findBlock: (id: string) => WireBlockContent | null,
  isAtomic: IsAtomic,
): Step {
  const tag = Object.keys(step)[0]!;
  const data = step[tag] as WireStepData;
  if (typeof data?.block_id !== "string") return step;
  const block = findBlock(data.block_id);
  if (block?.content.type !== "RichText" || !Array.isArray(block.content.value)) return step;
  const atoms = atomRanges(block.content.value as AnySpan[], isAtomic);
  if (!atoms.length) return step;
  const point = (offset: unknown) =>
    typeof offset === "number" ? nearestEdge(atoms, offset) : offset;
  switch (tag) {
    case "InsertText":
    case "SplitBlock":
      return { ...step, [tag]: { ...data, offset: point(data.offset) } };
    case "DeleteText":
    case "DeleteRange":
    case "AddMark":
    case "RemoveMark": {
      if (typeof data.from !== "number" || typeof data.to !== "number") return step;
      return { ...step, [tag]: { ...data, ...expandRange(atoms, data.from, data.to) } };
    }
    default:
      return step;
  }
}

/** The atoms of view spans, whose atomic marks carry `atomic: true` (MarkView). */
export function viewAtoms(
  spans: readonly { text: string; marks: readonly (AnyMark & { atomic?: true })[] }[],
): Atom[] {
  return atomRanges(
    spans.map((span) => ({ text: span.text, marks: span.marks.filter((mark) => mark.atomic) })),
    () => true,
  );
}
