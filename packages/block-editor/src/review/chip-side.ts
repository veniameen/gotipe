/** Which side of its cursor a flag stands on: after it (the default), or before it. */
export type ChipSide = "end" | "start";

/** What is known of a cursor's flag from the last time it was measured. */
export interface ChipState {
  side: ChipSide;
  /** Where the flag's left edge stood from its cursor when it stood after it; null until seen. */
  offset: number | null;
}

/** Room a flag must have to spare to come back after its cursor: no flipping at the edge. */
const SPARE = 12;

/**
 * The side a cursor's flag takes, from where it is drawn now. After its cursor it stays until it
 * crosses the page's end edge, then goes before the cursor if it has room there. Before its
 * cursor it stays until it would fit after it with room to spare, so a cursor at the edge does
 * not make it change sides back and forth.
 */
export function chipSide(
  known: ChipState | undefined,
  cursor: number,
  chip: { left: number; right: number; width: number },
  page: { left: number; right: number },
): ChipState {
  if (!known || known.side === "end") {
    const offset = chip.left - cursor;
    const crosses = chip.right > page.right && cursor - chip.width >= page.left;
    return { side: crosses ? "start" : "end", offset };
  }
  const fits = known.offset !== null && cursor + known.offset + chip.width + SPARE <= page.right;
  return fits ? { side: "end", offset: known.offset } : known;
}
