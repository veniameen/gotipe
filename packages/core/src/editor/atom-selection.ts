import { findBlockInTree } from "../document/tree";
import { type AtomRange, atomAt, snapOffset, viewAtoms } from "../engine/atoms";
import type { MarkSpec } from "../types/extension";
import type { BlockView, MarkView, SelectionView } from "../types/view";

type Point = SelectionView["anchor"];

/**
 * Keeps the caret out of inline atoms (docs/development/inline-atoms.md): every selection
 * the editor takes — from the DOM, the keyboard, a transaction or `setSelection` — moves
 * off an atom to its edge in the direction of movement. A range that lies within one atom
 * selects the whole atom. Reads the view's blocks, whose atomic marks are flagged; without
 * atomic marks in the schema it does nothing.
 */
export function createAtomSelection(
  marks: Readonly<Record<string, Omit<MarkSpec, "name">>>,
  getBlocks: () => BlockView[],
) {
  const atomic = new Set(
    Object.entries(marks)
      .filter(([, spec]) => spec.atomic === true)
      .map(([name]) => name),
  );
  const atomsOf = (blockId: string): AtomRange[] => {
    const content = blockId ? findBlockInTree(getBlocks(), blockId)?.content : null;
    return Array.isArray(content) ? viewAtoms(content) : [];
  };
  const point = (blockId: string, offset: number): Point => ({ blockId, offset });

  return {
    /** Whether the schema declares any atomic mark. */
    get enabled() {
      return atomic.size > 0;
    },
    isAtomic: (type: string) => atomic.has(type),
    /** Stored marks without atomic ones: typed text never becomes part of an atom. */
    marks(value: MarkView[] | null): MarkView[] | null {
      return value && atomic.size ? value.filter((mark) => !atomic.has(mark.type)) : value;
    },
    /** `next` with its points moved off atoms; `previous` gives the direction. */
    snap(next: SelectionView, previous: SelectionView | null): SelectionView {
      if (!atomic.size || next.type !== "text") return next;
      const { anchor, head } = next;
      const sameBlock = anchor.blockId === head.blockId;
      const headAtoms = atomsOf(head.blockId);
      if (!headAtoms.length && sameBlock) return next;
      const anchorAtoms = sameBlock ? headAtoms : atomsOf(anchor.blockId);
      const toward = (atoms: AtomRange[], at: Point, before: Point | null) => {
        const from = before?.blockId === at.blockId ? before.offset : null;
        const offset = snapOffset(atoms, at.offset, from);
        return offset === at.offset ? at : point(at.blockId, offset);
      };
      if (sameBlock && anchor.offset !== head.offset) {
        // A range within one atom (a double click, a drag) selects all of it.
        const inside =
          atomAt(headAtoms, head.offset) ?? atomAt(headAtoms, anchor.offset) ?? undefined;
        const covers = (offset: number) => inside && inside.from <= offset && offset <= inside.to;
        if (inside && covers(anchor.offset) && covers(head.offset)) {
          const forward = anchor.offset < head.offset;
          return {
            ...next,
            anchor: point(anchor.blockId, forward ? inside.from : inside.to),
            head: point(head.blockId, forward ? inside.to : inside.from),
          };
        }
      }
      // A caret moves as one point, from where the previous head was.
      const snappedHead = toward(headAtoms, head, previous?.head ?? null);
      const collapsed = sameBlock && anchor.offset === head.offset;
      const snappedAnchor = collapsed
        ? snappedHead
        : toward(anchorAtoms, anchor, previous?.anchor ?? null);
      return snappedAnchor === anchor && snappedHead === head
        ? next
        : { ...next, anchor: snappedAnchor, head: snappedHead };
    },
  };
}
