/**
 * Which side of its cursor a flag stands on: to its right (the default), or to its left. The
 * sides are physical: a right-to-left page gets no mirrored ones.
 */
export type ChipSide = "right" | "left";

/** What is known of a cursor's flag from the last time it was measured. */
export interface ChipState {
  side: ChipSide;
  /** Where the flag's left edge stood from its cursor when it stood right of it; null until seen. */
  offset: number | null;
}

/** Room a flag must have to spare to come back right of its cursor: no flipping at the edge. */
const SPARE = 12;

/**
 * The side a cursor's flag takes, from where it is drawn now. Right of its cursor it stays until
 * it crosses the page's right edge, then goes left of the cursor if it has room there. Left of
 * its cursor it stays until it would fit right of it with room to spare, so a cursor at the edge
 * does not make it change sides back and forth.
 */
export function chipSide(
  known: ChipState | undefined,
  cursor: number,
  chip: { left: number; right: number; width: number },
  page: { left: number; right: number },
): ChipState {
  if (!known || known.side === "right") {
    const offset = chip.left - cursor;
    const crosses = chip.right > page.right && cursor - chip.width >= page.left;
    return { side: crosses ? "left" : "right", offset };
  }
  const fits = known.offset !== null && cursor + known.offset + chip.width + SPARE <= page.right;
  return fits ? { side: "right", offset: known.offset } : known;
}
