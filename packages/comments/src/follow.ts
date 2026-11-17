/** Where a `[from, to)` range of the old text is in the new one, or null. */
export type FollowRange = (from: number, to: number) => { from: number; to: number } | null;

/** UTF-16 units that both texts share at their start (or end), at most `limit`. */
function shared(a: string, b: string, limit: number, fromEnd: boolean): number {
  let count = 0;
  while (
    count < limit &&
    (fromEnd
      ? a.charCodeAt(a.length - 1 - count) === b.charCodeAt(b.length - 1 - count)
      : a.charCodeAt(count) === b.charCodeAt(count))
  )
    count++;
  return count;
}

/** The edited window of `before`, placed as late or as early as the two texts allow. */
function edited(before: string, after: string, late: boolean): { start: number; end: number } {
  const limit = Math.min(before.length, after.length);
  if (late) {
    const start = shared(before, after, limit, false);
    return { start, end: before.length - shared(before, after, limit - start, true) };
  }
  const tail = shared(before, after, limit, true);
  return { start: shared(before, after, limit - tail, false), end: before.length - tail };
}

/**
 * Follows ranges across one change of a text. The change is read from the two texts: one edited
 * window between their common start and common end. A range wholly before the window keeps its
 * offsets, a range wholly after it moves by the change in length, including text typed or removed
 * right next to it. Next to repeated characters the window can sit at several places (typing "S"
 * before "Select"), so it is tried at its latest and at its earliest place, and a range follows the
 * first placement that leaves it untouched. A range the window touches, which is also the case for
 * edits on both sides of it in one change, gives null: the caller must not guess where it went.
 * The window is measured once, on the first call.
 */
export function followChange(before: string, after: string): FollowRange {
  const shift = after.length - before.length;
  let windows: { start: number; end: number }[] | null = null;
  return (from, to) => {
    if (before === after) return { from, to };
    windows ??= [edited(before, after, true), edited(before, after, false)];
    for (const { start, end } of windows) {
      if (to <= start) return { from, to };
      if (from >= end) return { from: from + shift, to: to + shift };
    }
    return null;
  };
}
